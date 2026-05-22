import { readFile } from 'fs/promises';
import { join, resolve, relative, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { simpleGit } from 'simple-git';
import { getQdrantClient, COLLECTIONS } from '../../lib/qdrant.js';
import { getDb, workspaceSymbols, eq, inArray } from '@arp/db';
import { getModelRouter, embedText } from '@arp/ai';
import type { ContextItem } from '@arp/shared';
import { estimateTokenCount } from '@arp/shared';

export interface RetrieveContextOptions {
  query: string;
  workspaceDir: string;
  maxSemanticItems?: number;
}

export async function retrieveContext(options: RetrieveContextOptions): Promise<ContextItem[]> {
  const { query, workspaceDir, maxSemanticItems = 8 } = options;
  const contextItems: ContextItem[] = [];

  // 1. Semantic Retrieval (Qdrant search over code symbols)
  try {
    const qdrant = getQdrantClient();
    const router = getModelRouter();
    const db = getDb();

    // Embed the search query
    const { embedding } = await embedText(query, router);

    // Search Qdrant
    const searchResults = await qdrant.search(COLLECTIONS.CODE_SYMBOLS, {
      vector: embedding,
      filter: {
        must: [
          { key: 'workspaceDir', match: { value: workspaceDir } }
        ]
      },
      limit: maxSemanticItems,
    });

    if (searchResults.length > 0) {
      const symbolIds = searchResults.map(r => r.payload?.symbolId as string).filter(Boolean);
      
      if (symbolIds.length > 0) {
        // Query Postgres for symbol metadata
        const symbolsData = await db
          .select()
          .from(workspaceSymbols)
          .where(inArray(workspaceSymbols.id, symbolIds));

        // Group similarity scores by symbol ID
        const scoreMap = new Map(searchResults.map(r => [r.payload?.symbolId as string, r.score]));

        for (const sym of symbolsData) {
          const absPath = join(workspaceDir, sym.filePath);
          if (existsSync(absPath)) {
            try {
              const fileContent = await readFile(absPath, 'utf8');
              const lines = fileContent.split('\n');
              const startIdx = Math.max(0, sym.startLine - 1);
              // Include a few lines of context around the symbol if possible
              const endIdx = Math.min(lines.length, sym.endLine);
              const snippet = lines.slice(startIdx, endIdx).join('\n');

              const score = scoreMap.get(sym.id) ?? 0.5;

              contextItems.push({
                id: sym.id,
                type: 'symbol',
                content: `// Symbol: ${sym.name} (${sym.symbolType})\n// File: ${sym.filePath}\n${snippet}`,
                path: sym.filePath,
                relevanceScore: score,
                tokenCount: estimateTokenCount(snippet),
                metadata: {
                  name: sym.name,
                  symbolType: sym.symbolType,
                  startLine: sym.startLine,
                  endLine: sym.endLine,
                  signature: sym.signature,
                },
              });
            } catch (readErr) {
              console.warn(`[Retriever] Could not read file ${sym.filePath} for symbol context:`, readErr);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Retriever] Semantic retrieval error:', err);
  }

  // 2. Git Diff Context
  try {
    const git = simpleGit(workspaceDir);
    const isRepo = await git.checkIsRepo();
    if (isRepo) {
      const diff = await git.diff();
      if (diff && diff.trim()) {
        contextItems.push({
          id: `git-diff-${Date.now()}`,
          type: 'git_diff',
          content: diff,
          relevanceScore: 0.95, // High relevance for current changes
          tokenCount: estimateTokenCount(diff),
          metadata: {},
        });
      }
    }
  } catch (err) {
    // Gracefully ignore if simple-git fails (e.g. not a git repo or git not in path)
    console.debug('[Retriever] Git diff retrieval skipped:', err);
  }

  // 3. File Mentions (Explicit files in query)
  try {
    // Regex to match file paths or names mentioned in the prompt
    // e.g. "read apps/api/src/app.ts" or just "executor.ts"
    const fileWordRegex = /(?:[\w\-\.\/]+\.(?:ts|tsx|js|jsx|py|go|json|md))/g;
    const matches = Array.from(new Set(query.match(fileWordRegex) || []));

    for (const fileMatch of matches) {
      // Check if file exists relative to workspace
      const absolutePath = resolve(workspaceDir, fileMatch);
      const rel = relative(resolve(workspaceDir), absolutePath);
      const isSafe = !rel.startsWith('..') && !isAbsolute(rel);

      if (isSafe && existsSync(absolutePath) && !fileMatch.includes('node_modules')) {
        try {
          const content = await readFile(absolutePath, 'utf8');
          // Skip pushing if the symbol retrieval already included it or if file is too large
          if (content.length < 50000) { // Limit size to 50KB to avoid bloating context
            contextItems.push({
              id: `file-mention-${fileMatch}`,
              type: 'file',
              content: content,
              path: fileMatch,
              relevanceScore: 0.9,
              tokenCount: estimateTokenCount(content),
              metadata: { explicitMention: true },
            });
          }
        } catch (readErr) {
          // Ignore
        }
      }
    }
  } catch (err) {
    console.error('[Retriever] File mention retrieval error:', err);
  }

  // Sort by relevance score descending
  return contextItems.sort((a, b) => b.relevanceScore - a.relevanceScore);
}
