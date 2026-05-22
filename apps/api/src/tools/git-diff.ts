import { simpleGit } from 'simple-git';
import type { ToolDefinition } from './registry.js';
import { GitDiffInputSchema } from '@arp/shared';

export const gitDiffTool: ToolDefinition = {
  name: 'git_diff',
  description: 'Get the git diff for the current repository showing changed files and lines.',
  inputSchema: GitDiffInputSchema,
  async execute(input, context) {
    const { directory, staged, commit, file } = input as {
      directory: string; staged: boolean; commit?: string; file?: string;
    };

    const gitDir = context.workspaceDir ?? directory;
    const git = simpleGit(gitDir);

    const options: string[] = [];
    if (staged) options.push('--staged');
    if (commit) options.push(commit);
    if (file) options.push('--', file);

    const diff = await git.diff(options);
    const status = await git.status();

    return {
      success: true,
      output: {
        diff: diff.slice(0, 100000), // Cap at 100KB
        status: {
          modified: status.modified,
          created: status.created,
          deleted: status.deleted,
          renamed: status.renamed,
          staged: status.staged,
          ahead: status.ahead,
          behind: status.behind,
          current: status.current,
        },
      },
      durationMs: 0,
    };
  },
};
