import { simpleGit } from 'simple-git';
import type { ToolDefinition } from './registry.js';
import { GitLogInputSchema } from '@arp/shared';

export const gitLogTool: ToolDefinition = {
  name: 'git_log',
  description: 'Get the git commit log/history for the repository.',
  inputSchema: GitLogInputSchema,
  async execute(input, context) {
    const { directory, limit, file } = input as {
      directory: string;
      limit: number;
      file?: string;
    };

    const gitDir = context.workspaceDir ?? directory;
    const git = simpleGit(gitDir);

    const options: Record<string, any> = { maxCount: limit };
    if (file) {
      options.file = file;
    }

    const logResult = await git.log(options);

    return {
      success: true,
      output: logResult,
      durationMs: 0,
    };
  },
};
