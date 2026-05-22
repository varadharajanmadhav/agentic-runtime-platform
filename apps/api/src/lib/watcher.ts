/**
 * Workspace File Watcher
 *
 * Uses chokidar to monitor workspaceDirs for file add/change/delete events.
 * Changes are debounced (2 seconds of idle) before the indexer is invoked,
 * so rapid saves during active editing don't thrash the DB or Qdrant.
 *
 * - add / change  → indexFile() for the affected file only (surgical update)
 * - unlink        → remove symbols from PostgreSQL + Qdrant for that file
 *
 * Multiple sessions can share the same workspaceDir; watchers are ref-counted
 * so the filesystem watch is opened once and closed when no sessions remain.
 */

import chokidar, { type FSWatcher } from 'chokidar';
import { relative, extname } from 'path';
import { getDb, workspaceSymbols, eq, and } from '@arp/db';
import { getQdrantClient, COLLECTIONS } from './qdrant.js';
import { indexFile, getIndexingStatus } from '../agents/context/indexer.js';

const INDEXED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go']);

const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.turbo/**',
  '**/.next/**',
  '**/out/**',
];

// Debounce delay in ms — waits for file saves to settle before re-indexing
const DEBOUNCE_MS = 2000;

interface WatcherEntry {
  watcher: FSWatcher;
  refCount: number;
  // Map of absolutePath → debounce timer
  pendingChanges: Map<string, ReturnType<typeof setTimeout>>;
  // Deleted paths queued for cleanup
  pendingDeletes: Map<string, ReturnType<typeof setTimeout>>;
}

const activeWatchers = new Map<string, WatcherEntry>();

// ─────────────────────────────────────────────────────────────────────────────

async function handleFileChange(workspaceDir: string, absolutePath: string): Promise<void> {
  const ext = extname(absolutePath).toLowerCase();
  if (!INDEXED_EXTENSIONS.has(ext)) return;

  try {
    // Only index if workspace has been indexed at least once
    const status = await getIndexingStatus(workspaceDir);
    if (status.status === 'idle') return; // Never indexed — skip auto-update

    const relativePath = relative(workspaceDir, absolutePath).replace(/\\/g, '/');
    console.log(`[Watcher] Re-indexing changed file: ${relativePath}`);
    await indexFile(workspaceDir, absolutePath);
    console.log(`[Watcher] ✓ Re-indexed: ${relativePath}`);
  } catch (err) {
    console.error(`[Watcher] Error re-indexing ${absolutePath}:`, err);
  }
}

async function handleFileDelete(workspaceDir: string, absolutePath: string): Promise<void> {
  const ext = extname(absolutePath).toLowerCase();
  if (!INDEXED_EXTENSIONS.has(ext)) return;

  const relativePath = relative(workspaceDir, absolutePath).replace(/\\/g, '/');

  try {
    const db = getDb();
    const qdrant = getQdrantClient();

    // Find all symbols for this file
    const existing = await db
      .select({ qdrantId: workspaceSymbols.qdrantId })
      .from(workspaceSymbols)
      .where(
        and(
          eq(workspaceSymbols.workspaceDir, workspaceDir),
          eq(workspaceSymbols.filePath, relativePath),
        )
      );

    // Remove from Qdrant
    const qdrantIds = existing.map(s => s.qdrantId).filter(Boolean) as string[];
    if (qdrantIds.length > 0) {
      await qdrant.delete(COLLECTIONS.CODE_SYMBOLS, { points: qdrantIds });
    }

    // Remove from PostgreSQL
    await db
      .delete(workspaceSymbols)
      .where(
        and(
          eq(workspaceSymbols.workspaceDir, workspaceDir),
          eq(workspaceSymbols.filePath, relativePath),
        )
      );

    console.log(`[Watcher] ✓ Removed index for deleted file: ${relativePath}`);
  } catch (err) {
    console.error(`[Watcher] Error removing index for deleted file ${absolutePath}:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start watching a workspace directory.
 * Safe to call multiple times for the same dir — uses ref-counting.
 */
export function watchWorkspace(workspaceDir: string): void {
  const existing = activeWatchers.get(workspaceDir);
  if (existing) {
    existing.refCount++;
    console.log(`[Watcher] Incremented ref for workspace: ${workspaceDir} (refs=${existing.refCount})`);
    return;
  }

  const pendingChanges = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>();

  const watcher = chokidar.watch(workspaceDir, {
    ignored: IGNORED_PATTERNS,
    persistent: true,
    ignoreInitial: true,   // Don't fire events for files present at startup
    awaitWriteFinish: {    // Wait for file writes to complete before firing
      stabilityThreshold: 300,
      pollInterval: 100,
    },
    depth: 20,
  });

  const scheduleChange = (absolutePath: string) => {
    // Cancel any existing pending debounce for this path
    const existing = pendingChanges.get(absolutePath);
    if (existing) clearTimeout(existing);

    // Also cancel any pending delete for this path (file was re-created)
    const existingDelete = pendingDeletes.get(absolutePath);
    if (existingDelete) {
      clearTimeout(existingDelete);
      pendingDeletes.delete(absolutePath);
    }

    const timer = setTimeout(() => {
      pendingChanges.delete(absolutePath);
      handleFileChange(workspaceDir, absolutePath);
    }, DEBOUNCE_MS);

    pendingChanges.set(absolutePath, timer);
  };

  const scheduleDelete = (absolutePath: string) => {
    // Cancel any pending change for this path
    const existingChange = pendingChanges.get(absolutePath);
    if (existingChange) {
      clearTimeout(existingChange);
      pendingChanges.delete(absolutePath);
    }

    const existing = pendingDeletes.get(absolutePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      pendingDeletes.delete(absolutePath);
      handleFileDelete(workspaceDir, absolutePath);
    }, DEBOUNCE_MS);

    pendingDeletes.set(absolutePath, timer);
  };

  watcher
    .on('add',    (path) => { scheduleChange(path); })
    .on('change', (path) => { scheduleChange(path); })
    .on('unlink', (path) => { scheduleDelete(path); })
    .on('error',  (err)  => { console.error(`[Watcher] Chokidar error in ${workspaceDir}:`, err); });

  activeWatchers.set(workspaceDir, {
    watcher,
    refCount: 1,
    pendingChanges,
    pendingDeletes,
  });

  console.log(`[Watcher] Started watching workspace: ${workspaceDir}`);
}

/**
 * Stop watching a workspace directory.
 * Uses ref-counting — watcher is only closed when all consumers have released it.
 */
export async function unwatchWorkspace(workspaceDir: string): Promise<void> {
  const entry = activeWatchers.get(workspaceDir);
  if (!entry) return;

  entry.refCount--;
  if (entry.refCount > 0) {
    console.log(`[Watcher] Decremented ref for workspace: ${workspaceDir} (refs=${entry.refCount})`);
    return;
  }

  // Clear all pending debounce timers
  for (const timer of entry.pendingChanges.values()) clearTimeout(timer);
  for (const timer of entry.pendingDeletes.values()) clearTimeout(timer);

  await entry.watcher.close();
  activeWatchers.delete(workspaceDir);
  console.log(`[Watcher] Stopped watching workspace: ${workspaceDir}`);
}

/**
 * Stop all active watchers — called during graceful shutdown.
 */
export async function stopAllWatchers(): Promise<void> {
  const dirs = Array.from(activeWatchers.keys());
  for (const dir of dirs) {
    const entry = activeWatchers.get(dir);
    if (!entry) continue;
    for (const timer of entry.pendingChanges.values()) clearTimeout(timer);
    for (const timer of entry.pendingDeletes.values()) clearTimeout(timer);
    await entry.watcher.close();
    activeWatchers.delete(dir);
  }
  console.log(`[Watcher] All watchers stopped (${dirs.length} workspaces).`);
}

/**
 * Returns a snapshot of currently-watched workspaces.
 */
export function getActiveWatchers(): { workspaceDir: string; refCount: number }[] {
  return Array.from(activeWatchers.entries()).map(([dir, entry]) => ({
    workspaceDir: dir,
    refCount: entry.refCount,
  }));
}
