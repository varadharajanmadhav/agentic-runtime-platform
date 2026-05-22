import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve, relative, isAbsolute } from 'path';
import type { ToolDefinition } from './registry.js';
import { SearchFilesInputSchema } from '@arp/shared';

const execFileAsync = promisify(execFile);

/**
 * H-9: Validate that searchDir stays within workspaceDir boundary.
 */
function resolveSearchDir(directory: string, workspaceDir: string | undefined): string {
  if (!workspaceDir) {
    return resolve(directory);
  }

  const resolved = resolve(workspaceDir, directory);
  const rel = relative(resolve(workspaceDir), resolved);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    // Fall back to workspace root instead of allowing escape
    console.warn(`[search_files] directory "${directory}" escapes workspace; falling back to workspace root`);
    return resolve(workspaceDir);
  }

  return resolved;
}

export const searchFilesTool: ToolDefinition = {
  name: 'search_files',
  description: 'Search for a pattern in files using grep/ripgrep. Returns matching file paths and line snippets.',
  inputSchema: SearchFilesInputSchema,
  async execute(input, context) {
    const { query, directory, filePattern, isRegex, caseSensitive, maxResults, includeLineNumbers } = input as {
      query: string;
      directory: string;
      filePattern?: string;
      isRegex: boolean;
      caseSensitive: boolean;
      maxResults: number;
      includeLineNumbers: boolean;
    };

    // H-9: Use safe path resolution instead of string concatenation
    const searchDir = resolveSearchDir(directory, context.workspaceDir ?? undefined);

    // Try ripgrep first, fall back to grep
    try {
      const args = ['--json'];
      if (!caseSensitive) args.push('-i');
      if (!isRegex) args.push('-F');
      if (filePattern) args.push('-g', filePattern);
      args.push('-m', String(maxResults));
      args.push(query, searchDir);

      const { stdout } = await execFileAsync('rg', args, { maxBuffer: 10 * 1024 * 1024 });

      const results = stdout
        .split('\n')
        .filter(Boolean)
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter((r): r is Record<string, unknown> => r !== null && r.type === 'match');

      return { success: true, output: { results, tool: 'ripgrep' }, durationMs: 0 };
    } catch {
      // Fallback to basic grep
      const flags = ['-rn', caseSensitive ? '' : '-i', isRegex ? '' : '-F', '--include', filePattern ?? '*']
        .filter(Boolean);
      try {
        const { stdout } = await execFileAsync('grep', [...flags, query, searchDir], {
          maxBuffer: 10 * 1024 * 1024,
        });
        const lines = stdout.split('\n').filter(Boolean).slice(0, maxResults);
        return { success: true, output: { results: lines, tool: 'grep' }, durationMs: 0 };
      } catch (err) {
        return { success: true, output: { results: [], message: 'No matches found' }, durationMs: 0 };
      }
    }
  },
};
