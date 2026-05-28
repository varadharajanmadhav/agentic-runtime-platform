import { readdir, stat } from 'fs/promises';
import { resolve, relative, isAbsolute, join } from 'path';
import { FindFilesInputSchema } from '@arp/shared';
import type { ToolDefinition } from './registry.js';

const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', '.next', 'out', 'bin', 'obj']);

function resolveDir(directory: string, workspaceDir: string | undefined): string {
  if (!workspaceDir) return resolve(directory);
  const root = resolve(workspaceDir);
  const resolved = resolve(root, directory);
  const rel = relative(root, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) return root;
  return resolved;
}

function matchPattern(name: string, pattern: string): boolean {
  const lower = name.toLowerCase();
  const p = pattern.toLowerCase();
  // Simple glob: *suffix, prefix*, *middle*, or plain substring
  if (p.startsWith('*') && p.endsWith('*')) return lower.includes(p.slice(1, -1));
  if (p.startsWith('*')) return lower.endsWith(p.slice(1));
  if (p.endsWith('*')) return lower.startsWith(p.slice(0, -1));
  // Extension shorthand: "*.cs" → match ".cs" extension
  if (p.startsWith('*.')) return lower.endsWith(p.slice(1));
  // Plain substring match
  return lower.includes(p);
}

export const findFilesTool: ToolDefinition = {
  name: 'find_files',
  description:
    'Recursively find files by name pattern within the workspace. Use this to locate files by filename, not by content. Supports substrings ("Dromont"), extensions ("*.cs"), and simple globs ("*Controller*").',
  inputSchema: FindFilesInputSchema,
  async execute(input, context) {
    const { pattern, directory, maxResults, includeHidden } = input as {
      pattern: string;
      directory: string;
      maxResults: number;
      includeHidden: boolean;
    };

    const root = resolveDir(directory, context.workspaceDir ?? undefined);
    const matches: string[] = [];
    let scanned = 0;

    async function walk(dir: string): Promise<void> {
      if (matches.length >= maxResults) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= maxResults) break;
        if (!includeHidden && entry.name.startsWith('.')) continue;
        if (IGNORED.has(entry.name)) continue;

        const fullPath = join(dir, entry.name);
        scanned++;

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (matchPattern(entry.name, pattern)) {
          // Return path relative to workspace root for readability
          const rel = context.workspaceDir
            ? relative(resolve(context.workspaceDir), fullPath)
            : fullPath;
          matches.push(rel);
        }
      }
    }

    await walk(root);

    return {
      success: true,
      output: {
        matches,
        totalFound: matches.length,
        scanned,
        truncated: matches.length >= maxResults,
        searchRoot: root,
      },
      durationMs: 0,
    };
  },
};
