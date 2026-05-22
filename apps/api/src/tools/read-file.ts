import { readFile, stat } from 'fs/promises';
import { resolve, relative, isAbsolute } from 'path';
import type { ToolDefinition } from './registry.js';
import { ReadFileInputSchema } from '@arp/shared';

/**
 * Ensures that `targetPath` (resolved against `workspaceDir`) stays within
 * the workspace boundary. Throws if it would escape via path traversal.
 */
function assertWithinWorkspace(absolutePath: string, workspaceDir: string): void {
  const rel = relative(workspaceDir, absolutePath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path traversal detected: resolved path is outside workspace boundary`);
  }
}

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file from the filesystem. Can read a specific line range.',
  inputSchema: ReadFileInputSchema,
  async execute(input, context) {
    const { path, encoding, startLine, endLine } = input as {
      path: string; encoding: 'utf8' | 'base64'; startLine?: number; endLine?: number;
    };

    const absolutePath = context.workspaceDir
      ? resolve(context.workspaceDir, path)
      : resolve(path);

    // CR-3: Prevent path traversal attacks
    if (context.workspaceDir) {
      assertWithinWorkspace(absolutePath, context.workspaceDir);
    }

    const stats = await stat(absolutePath);
    if (stats.size > 10 * 1024 * 1024) { // 10MB limit
      return { success: false, output: null, error: 'File too large (> 10MB)', durationMs: 0 };
    }

    const content = await readFile(absolutePath, encoding);

    if (startLine !== undefined || endLine !== undefined) {
      const lines = content.split('\n');
      const start = (startLine ?? 1) - 1;
      const end = endLine ?? lines.length;
      const sliced = lines.slice(start, end).join('\n');
      return {
        success: true,
        output: {
          path: absolutePath,
          content: sliced,
          totalLines: lines.length,
          startLine: start + 1,
          endLine: Math.min(end, lines.length),
        },
        durationMs: 0,
      };
    }

    return {
      success: true,
      output: { path: absolutePath, content, totalLines: content.split('\n').length },
      durationMs: 0,
    };
  },
};
