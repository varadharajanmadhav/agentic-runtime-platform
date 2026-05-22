import { writeFile, mkdir } from 'fs/promises';
import { resolve, relative, dirname, isAbsolute } from 'path';
import type { ToolDefinition } from './registry.js';
import { WriteFileInputSchema } from '@arp/shared';

/**
 * Ensures that `absolutePath` stays within the workspace boundary.
 * Throws if it would escape via path traversal.
 */
function assertWithinWorkspace(absolutePath: string, workspaceDir: string): void {
  const rel = relative(workspaceDir, absolutePath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path traversal detected: resolved path is outside workspace boundary`);
  }
}

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write content to a file. Creates parent directories if they do not exist.',
  inputSchema: WriteFileInputSchema,
  async execute(input, context) {
    const { path, content, createDirectories, encoding } = input as {
      path: string; content: string; createDirectories: boolean; encoding: 'utf8' | 'base64';
    };

    const absolutePath = context.workspaceDir
      ? resolve(context.workspaceDir, path)
      : resolve(path);

    // CR-3: Prevent path traversal attacks
    if (context.workspaceDir) {
      assertWithinWorkspace(absolutePath, context.workspaceDir);
    }

    if (createDirectories) {
      await mkdir(dirname(absolutePath), { recursive: true });
    }

    await writeFile(absolutePath, content, encoding);

    return {
      success: true,
      output: {
        path: absolutePath,
        bytesWritten: Buffer.byteLength(content, encoding),
      },
      durationMs: 0,
    };
  },
};
