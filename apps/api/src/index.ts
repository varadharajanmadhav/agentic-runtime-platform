import 'dotenv/config';
import { buildApp } from './app.js';
import { initDb, getDb, tasks, sessions, inArray, closeDb } from '@arp/db';
import { initModelRouter } from '@arp/ai';
import { startWorker } from './lib/queue.js';
import { closeRedis, getRedisClient } from './lib/redis.js';
import { ensureCollections } from './lib/qdrant.js';
import { watchWorkspace, stopAllWatchers } from './lib/watcher.js';
import { getIndexingStatus } from './agents/context/indexer.js';
import type { Worker } from 'bullmq';
import type { FastifyInstance } from 'fastify';

async function cleanupStaleTasks() {
  const db = getDb();
  try {
    const staleStatuses = ['planning', 'executing', 'validating', 'reflecting'] as ('completed' | 'queued' | 'planning' | 'executing' | 'validating' | 'reflecting' | 'failed' | 'cancelled')[];
    const updated = await db
      .update(tasks)
      .set({
        status: 'failed',
        result: {
          success: false,
          output: '',
          failureReason: 'Task was interrupted due to API server restart/shutdown.',
          retryCount: 0,
        },
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(tasks.status, staleStatuses))
      .returning({ id: tasks.id });

    if (updated.length > 0) {
      console.log(`[ARP] Cleaned up ${updated.length} stale tasks:`, updated.map(t => t.id));
    } else {
      console.log('[ARP] No stale tasks to clean up.');
    }
  } catch (err) {
    console.error('[ARP] Failed to clean up stale tasks:', err);
  }
}

async function cleanupStaleIndexing() {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys('arp:indexing:*');
    let resetCount = 0;
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const progress = JSON.parse(data);
          if (progress.status === 'indexing') {
            progress.status = 'failed';
            progress.error = 'Indexing was interrupted due to API server restart/shutdown.';
            await redis.set(key, JSON.stringify(progress), 'EX', 86400); // 1 day TTL
            resetCount++;
          }
        } catch (e) {
          console.error(`[ARP] Failed to parse indexing progress for key ${key}:`, e);
        }
      }
    }
    if (resetCount > 0) {
      console.log(`[ARP] Cleaned up ${resetCount} stale indexing states.`);
    } else {
      console.log('[ARP] No stale indexing states to clean up.');
    }
  } catch (err) {
    console.error('[ARP] Failed to clean up stale indexing states:', err);
  }
}

// CR-7: Proper graceful shutdown — drain worker, close DB and Redis before exiting
async function gracefulShutdown(
  signal: string,
  app: FastifyInstance,
  taskWorker: Worker | null,
): Promise<void> {
  console.log(`[ARP] Received ${signal}, shutting down gracefully...`);
  try {
    // 1. Stop accepting new HTTP requests
    await app.close();
    console.log('[ARP] HTTP server closed');

    // 2. Drain the BullMQ worker (waits for in-progress jobs to finish)
    if (taskWorker) {
      await taskWorker.close();
      console.log('[ARP] Task worker drained');
    }

    // 3. Stop all file system watchers
    await stopAllWatchers();

    // 4. Close Redis
    await closeRedis();
    console.log('[ARP] Redis connection closed');

    // 5. Close PostgreSQL pool
    await closeDb();
    console.log('[ARP] Database connection closed');
  } catch (err) {
    console.error('[ARP] Error during graceful shutdown:', err);
  }
  process.exit(0);
}

async function main() {
  // Initialize database
  await initDb();
  console.log('[ARP] Database connected');

  // Clean up stale tasks
  await cleanupStaleTasks();

  // Clean up stale indexing states
  await cleanupStaleIndexing();

  // Initialize Qdrant collections
  await ensureCollections();
  console.log('[ARP] Qdrant collections verified');

  // Initialize model router
  initModelRouter();
  console.log('[ARP] Model router initialized');

  // Start task worker
  const taskWorker = startWorker();
  console.log('[ARP] Task worker started');

  // Restore file watchers for all sessions that have a workspaceDir and have been indexed
  try {
    const db = getDb();
    const allSessions = await db
      .select({ workspaceDir: sessions.workspaceDir })
      .from(sessions);
    const uniqueDirs = [...new Set(
      allSessions.map(s => s.workspaceDir).filter(Boolean) as string[]
    )];
    let watchCount = 0;
    for (const dir of uniqueDirs) {
      const status = await getIndexingStatus(dir);
      if (status.status === 'completed') {
        watchWorkspace(dir);
        watchCount++;
      }
    }
    if (watchCount > 0) {
      console.log(`[ARP] Restored file watchers for ${watchCount} workspace(s).`);
    }
  } catch (err) {
    console.error('[ARP] Failed to restore file watchers:', err);
  }

  // Build and start Fastify
  const app = await buildApp();

  const port = parseInt(process.env.API_PORT ?? '3001', 10);
  const host = process.env.API_HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`[ARP] API server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Register graceful shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM', app, taskWorker));
  process.on('SIGINT', () => gracefulShutdown('SIGINT', app, taskWorker));
}

main().catch(console.error);
