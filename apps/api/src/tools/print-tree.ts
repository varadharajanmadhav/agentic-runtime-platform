import { readdir, stat } from 'fs/promises';
import { isAbsolute, relative, resolve } from 'path';
import { PrintTreeInputSchema } from '@arp/shared';
import type { ToolDefinition } from './registry.js';
import { capOutput } from './utils.js';

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.turbo',
  '.next',
  'out',
]);

function resolveTreeDir(directory: string, workspaceDir: string | undefined): string {
  if (!workspaceDir) {
    return resolve(directory);
  }

  const workspaceRoot = resolve(workspaceDir);
  const resolved = resolve(workspaceRoot, directory);
  const rel = relative(workspaceRoot, resolved);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path traversal detected: resolved path is outside workspace boundary');
  }

  return resolved;
}

export const printTreeTool: ToolDefinition = {
  name: 'print_tree',
  description: 'Print a bounded directory tree for the workspace. Use this to inspect project structure.',
  inputSchema: PrintTreeInputSchema,
  async execute(input, context) {
    const { directory, maxDepth, maxEntries, includeHidden } = input as {
      directory: string;
      maxDepth: number;
      maxEntries: number;
      includeHidden: boolean;
    };

    const root = resolveTreeDir(directory, context.workspaceDir ?? undefined);
    const rootStats = await stat(root);
    if (!rootStats.isDirectory()) {
      return { success: false, output: null, error: 'Path is not a directory', durationMs: 0 };
    }

    const lines: string[] = [root];
    let entryCount = 0;
    let truncated = false;

    async function walk(currentDir: string, prefix: string, depth: number): Promise<void> {
      if (depth >= maxDepth || truncated) return;

      const entries = await readdir(currentDir, { withFileTypes: true });
      const visibleEntries = entries
        .filter(entry => includeHidden || !entry.name.startsWith('.'))
        .filter(entry => !IGNORED_NAMES.has(entry.name))
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      for (let i = 0; i < visibleEntries.length; i++) {
        if (entryCount >= maxEntries) {
          truncated = true;
          lines.push(`${prefix}... [tree truncated after ${maxEntries} entries]`);
          return;
        }

        const entry = visibleEntries[i];
        const isLast = i === visibleEntries.length - 1;
        const connector = isLast ? '`-- ' : '|-- ';
        const childPrefix = isLast ? '    ' : '|   ';
        const absolutePath = resolve(currentDir, entry.name);
        const label = entry.isDirectory() ? `${entry.name}/` : entry.name;

        lines.push(`${prefix}${connector}${label}`);
        entryCount++;

        if (entry.isDirectory()) {
          await walk(absolutePath, `${prefix}${childPrefix}`, depth + 1);
        }
      }
    }

    await walk(root, '', 0);

    return {
      success: true,
      output: {
        root,
        tree: capOutput(lines.join('\n'), context, 30000),
        entryCount,
        truncated,
      },
      durationMs: 0,
    };
  },
};
