import { spawn } from 'child_process';
import { resolve, join } from 'path';
import type { ToolDefinition } from './registry.js';
import { NpmRunInputSchema } from '@arp/shared';

export const npmRunTool: ToolDefinition = {
  name: 'npm_run',
  description: 'Execute an npm script (e.g. build, test, lint) inside a project directory.',
  inputSchema: NpmRunInputSchema,
  async execute(input, context) {
    const { script, directory, extraArgs } = input as {
      script: string;
      directory?: string;
      extraArgs?: string[];
    };

    const workspaceRoot = context.workspaceDir ?? process.cwd();
    const cwd = directory ? resolve(workspaceRoot, directory) : workspaceRoot;

    return new Promise((resolvePromise) => {
      const start = Date.now();
      let stdout = '';
      let stderr = '';

      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'npm.cmd' : 'npm';
      const args = ['run', script];

      if (extraArgs && extraArgs.length > 0) {
        args.push('--', ...extraArgs);
      }

      const child = spawn(cmd, args, {
        cwd,
        shell: isWin,
        stdio: 'pipe',
      });

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (exitCode) => {
        resolvePromise({
          success: exitCode === 0,
          output: {
            stdout: stdout.slice(0, 100000), // Cap at 100KB
            stderr: stderr.slice(0, 50000),
            exitCode,
            command: `${cmd} ${args.join(' ')}`,
            directory: cwd,
          },
          durationMs: Date.now() - start,
        });
      });

      child.on('error', (err) => {
        resolvePromise({
          success: false,
          output: {
            stdout: '',
            stderr: err.message,
            exitCode: -1,
            command: `${cmd} ${args.join(' ')}`,
          },
          error: err.message,
          durationMs: Date.now() - start,
        });
      });
    });
  },
};
