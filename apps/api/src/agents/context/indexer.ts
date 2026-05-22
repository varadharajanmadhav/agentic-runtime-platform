import ts from 'typescript';
import { glob } from 'glob';
import { readFile, stat } from 'fs/promises';
import { join, relative, extname } from 'path';
import { randomUUID, createHash } from 'crypto';
import { getQdrantClient, COLLECTIONS } from '../../lib/qdrant.js';
import { getDb, workspaceSymbols, eq, and } from '@arp/db';
import { getModelRouter, embedTexts } from '@arp/ai';
import { getRedisClient } from '../../lib/redis.js';

export interface ExtractedSymbol {
  name: string;
  type: 'class' | 'interface' | 'function' | 'method' | 'variable';
  signature: string;
  docstring: string;
  startLine: number;
  endLine: number;
}

export interface IndexingProgress {
  status: 'idle' | 'indexing' | 'completed' | 'failed';
  totalFiles: number;
  processedFiles: number;
  progressPercent: number;
  error?: string;
}

// H-6: Persist indexing progress in Redis to survive server restarts
export async function getIndexingStatus(workspaceDir: string): Promise<IndexingProgress> {
  try {
    const redis = getRedisClient();
    const data = await redis.get(`arp:indexing:${workspaceDir}`);
    if (data) {
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[Indexer] Redis get error:', err);
  }
  return {
    status: 'idle',
    totalFiles: 0,
    processedFiles: 0,
    progressPercent: 0,
  };
}

export async function setIndexingStatus(workspaceDir: string, progress: Partial<IndexingProgress>): Promise<void> {
  try {
    const redis = getRedisClient();
    const current = await getIndexingStatus(workspaceDir);
    const updated = { ...current, ...progress };
    await redis.set(`arp:indexing:${workspaceDir}`, JSON.stringify(updated), 'EX', 86400); // 1 day TTL
  } catch (err) {
    console.error('[Indexer] Redis set error:', err);
  }
}

// ── Symbol Extraction Parsers ─────────────────────────────────

export function extractSymbolsFromTs(filePath: string, fileContent: string): ExtractedSymbol[] {
  const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true);
  const symbols: ExtractedSymbol[] = [];

  function visit(node: ts.Node) {
    let symbol: ExtractedSymbol | null = null;

    if (ts.isClassDeclaration(node) && node.name) {
      symbol = {
        name: node.name.text,
        type: 'class',
        signature: node.getText(sourceFile).split('{')[0].trim(),
        docstring: getDocstring(node),
        startLine: getStartLine(node),
        endLine: getEndLine(node),
      };
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      symbol = {
        name: node.name.text,
        type: 'interface',
        signature: node.getText(sourceFile).split('{')[0].trim(),
        docstring: getDocstring(node),
        startLine: getStartLine(node),
        endLine: getEndLine(node),
      };
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      symbol = {
        name: node.name.text,
        type: 'function',
        signature: node.getText(sourceFile).split('{')[0].trim(),
        docstring: getDocstring(node),
        startLine: getStartLine(node),
        endLine: getEndLine(node),
      };
    } else if (ts.isMethodDeclaration(node) && node.name) {
      // M-5: Clean AST-based method extraction prevents duplicate symbol indexing
      const className = node.parent && ts.isClassDeclaration(node.parent) && node.parent.name ? node.parent.name.text : '';
      const methodName = node.name.getText(sourceFile);
      symbol = {
        name: className ? `${className}.${methodName}` : methodName,
        type: 'method',
        signature: node.getText(sourceFile).split('{')[0].trim(),
        docstring: getDocstring(node),
        startLine: getStartLine(node),
        endLine: getEndLine(node),
      };
    }

    if (symbol) {
      symbols.push(symbol);
    }

    ts.forEachChild(node, visit);
  }

  function getDocstring(node: ts.Node): string {
    const jsDoc = (node as any).jsDoc;
    if (jsDoc && jsDoc.length > 0) {
      return jsDoc.map((doc: any) => {
        if (typeof doc.comment === 'string') return doc.comment;
        if (Array.isArray(doc.comment)) {
          return doc.comment.map((c: any) => c.text || '').join('');
        }
        return '';
      }).join('\n').trim();
    }
    return '';
  }

  function getStartLine(node: ts.Node): number {
    const { line } = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    return line + 1;
  }

  function getEndLine(node: ts.Node): number {
    const { line } = ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd());
    return line + 1;
  }

  visit(sourceFile);
  return symbols;
}

export function extractSymbolsRegex(filePath: string, fileContent: string, ext: string): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];
  const lines = fileContent.split('\n');

  if (ext === '.py') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          type: 'class',
          signature: line.trim(),
          docstring: '',
          startLine: i + 1,
          endLine: i + 1,
        });
      }
      const funcMatch = line.match(/^\s*def\s+(\w+)\(/);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          type: 'function',
          signature: line.trim(),
          docstring: '',
          startLine: i + 1,
          endLine: i + 1,
        });
      }
    }
  } else if (ext === '.go') {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)\(/);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          type: 'function',
          signature: line.trim(),
          docstring: '',
          startLine: i + 1,
          endLine: i + 1,
        });
      }
    }
  }

  return symbols;
}

export async function getStoredHash(workspaceDir: string, relativePath: string): Promise<string | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({ metadata: workspaceSymbols.metadata })
      .from(workspaceSymbols)
      .where(
        and(
          eq(workspaceSymbols.workspaceDir, workspaceDir),
          eq(workspaceSymbols.filePath, relativePath)
        )
      )
      .limit(1);

    if (rows.length > 0 && rows[0].metadata) {
      const meta = rows[0].metadata as Record<string, any>;
      if (meta && typeof meta.fileHash === 'string') {
        return meta.fileHash;
      }
    }
  } catch (err) {
    console.error(`[Indexer] Error reading stored hash for ${relativePath}:`, err);
  }
  return null;
}

export async function processConcurrently<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      if (currentIndex >= items.length) break;
      const item = items[currentIndex];
      try {
        results[currentIndex] = await fn(item);
      } catch (err) {
        console.error(`[Indexer] processConcurrently worker error:`, err);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

// ── File Indexer Worker ───────────────────────────────────────

export async function indexFile(workspaceDir: string, absolutePath: string, computedHash?: string): Promise<void> {
  const relativePath = relative(workspaceDir, absolutePath).replace(/\\/g, '/');
  const ext = extname(absolutePath).toLowerCase();
  
  const content = await readFile(absolutePath, 'utf8');
  const hash = computedHash || createHash('sha256').update(content).digest('hex');

  let symbols: ExtractedSymbol[] = [];

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    symbols = extractSymbolsFromTs(absolutePath, content);
  } else if (['.py', '.go'].includes(ext)) {
    symbols = extractSymbolsRegex(absolutePath, content, ext);
  }

  const db = getDb();
  const qdrant = getQdrantClient();
  const router = getModelRouter();

  // 1. Clean existing records to avoid duplications
  const existing = await db
    .select()
    .from(workspaceSymbols)
    .where(
      and(
        eq(workspaceSymbols.workspaceDir, workspaceDir),
        eq(workspaceSymbols.filePath, relativePath)
      )
    );

  const qdrantIds = existing.map(s => s.qdrantId).filter(Boolean) as string[];
  if (qdrantIds.length > 0) {
    try {
      await qdrant.delete(COLLECTIONS.CODE_SYMBOLS, {
        points: qdrantIds,
      });
    } catch (err) {
      console.warn(`[Indexer] Qdrant delete error for ${relativePath}:`, err);
    }
  }

  await db
    .delete(workspaceSymbols)
    .where(
      and(
        eq(workspaceSymbols.workspaceDir, workspaceDir),
        eq(workspaceSymbols.filePath, relativePath)
      )
    );

  if (symbols.length === 0) {
    // Store a placeholder row representing the file itself so its hash is saved and not scanned again
    await db.insert(workspaceSymbols).values({
      id: randomUUID(),
      workspaceDir,
      filePath: relativePath,
      language: ext.slice(1) || 'unknown',
      symbolType: 'file',
      name: '__file_hash__',
      signature: '',
      docstring: '',
      startLine: 0,
      endLine: 0,
      qdrantId: null,
      metadata: { fileHash: hash },
      indexedAt: new Date(),
    });
    return;
  }

  // 2. Embed symbol texts
  const symbolTexts = symbols.map(s => `Symbol Name: ${s.name}\nType: ${s.type}\nSignature: ${s.signature}\nDocstring: ${s.docstring}`);
  const embeddingResults = await embedTexts(symbolTexts, router);

  // 3. Upsert to PostgreSQL and Qdrant
  const qdrantPoints: any[] = [];
  const symbolRows: any[] = [];
  
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const embedding = embeddingResults[i].embedding;
    const symbolId = randomUUID();
    const qdrantPointId = randomUUID();

    symbolRows.push({
      id: symbolId,
      workspaceDir,
      filePath: relativePath,
      language: ext.slice(1),
      symbolType: symbol.type,
      name: symbol.name,
      signature: symbol.signature,
      docstring: symbol.docstring,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      qdrantId: qdrantPointId,
      metadata: { fileHash: hash },
      indexedAt: new Date(),
    });

    qdrantPoints.push({
      id: qdrantPointId,
      vector: embedding,
      payload: {
        symbolId,
        workspaceDir,
        filePath: relativePath,
        name: symbol.name,
        symbolType: symbol.type,
        signature: symbol.signature,
        docstring: symbol.docstring,
      },
    });
  }

  // H-5: Batch symbol DB inserts in indexFile() — single DB round-trip instead of N
  if (symbolRows.length > 0) {
    await db.insert(workspaceSymbols).values(symbolRows);
  }

  if (qdrantPoints.length > 0) {
    await qdrant.upsert(COLLECTIONS.CODE_SYMBOLS, {
      wait: true,
      points: qdrantPoints,
    });
  }
}

// ── Workspace Background Indexer ──────────────────────────────

export function startIndexing(workspaceDir: string) {
  // Start indexing asynchronously in background
  const run = async () => {
    try {
      console.log(`[Indexer] Starting indexing for workspace: ${workspaceDir}`);
      await setIndexingStatus(workspaceDir, {
        status: 'indexing',
        totalFiles: 0,
        processedFiles: 0,
        progressPercent: 0,
      });

      // Find files in workspace using glob
      const files = await glob('**/*.{ts,tsx,js,jsx,py,go}', {
        cwd: workspaceDir,
        absolute: true,
        ignore: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.turbo/**',
          '**/.next/**',
          '**/out/**',
        ],
      });

      const totalFiles = files.length;
      console.log(`[Indexer] Found ${totalFiles} code files to index in ${workspaceDir}`);
      
      await setIndexingStatus(workspaceDir, { totalFiles });

      if (totalFiles === 0) {
        await setIndexingStatus(workspaceDir, {
          status: 'completed',
          progressPercent: 100,
        });
        return;
      }

      let processedFiles = 0;
      await processConcurrently(files, 5, async (file) => {
        try {
          const relativePath = relative(workspaceDir, file).replace(/\\/g, '/');
          const content = await readFile(file, 'utf8');
          const computedHash = createHash('sha256').update(content).digest('hex');

          // Check if we can skip
          const storedHash = await getStoredHash(workspaceDir, relativePath);
          if (storedHash === computedHash) {
            return; // Skip indexing
          }

          // Re-index the file
          await indexFile(workspaceDir, file, computedHash);
        } catch (fileErr) {
          console.error(`[Indexer] Error processing file ${file}:`, fileErr);
        } finally {
          processedFiles++;
          const progressPercent = Math.round((processedFiles / totalFiles) * 100);
          await setIndexingStatus(workspaceDir, {
            processedFiles,
            progressPercent,
          });
        }
      });

      console.log(`[Indexer] Completed indexing for workspace: ${workspaceDir}`);
      await setIndexingStatus(workspaceDir, {
        status: 'completed',
        progressPercent: 100,
      });

    } catch (err: any) {
      console.error(`[Indexer] Workspace indexing failed for ${workspaceDir}:`, err);
      await setIndexingStatus(workspaceDir, {
        status: 'failed',
        error: err.message || String(err),
      });
    }
  };

  run().catch(err => console.error('[Indexer] Fatal background indexing error:', err));
}
