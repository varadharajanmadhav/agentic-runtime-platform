import { simpleGit } from 'simple-git';
import type { ToolDefinition } from './registry.js';
import { GitShowInputSchema } from '@arp/shared';
import { capOutput } from './utils.js';

export const gitShowTool: ToolDefinition = {
  name: 'git_show',
  description: 'Show details of a specific git commit, including diffs and metadata.',
  inputSchema: GitShowInputSchema,
  async execute(input, context) {
    const { directory, commit, file } = input as {
      directory: string;
      commit: string;
      file?: string;
    };

    const gitDir = context.workspaceDir ?? directory;
    const git = simpleGit(gitDir);

    const args = [commit];
    if (file) {
      args.push('--', file);
    }

    const showResult = await git.show(args);

    return {
      success: true,
      output: capOutput(showResult, context, 100000),
      durationMs: 0,
    };
  },
};
