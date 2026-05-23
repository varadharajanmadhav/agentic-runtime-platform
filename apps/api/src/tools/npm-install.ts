import { spawn } from 'child_process';
import { resolve } from 'path';
import type { ToolDefinition } from './registry.js';
import { NpmInstallInputSchema } from '@arp/shared';

export const npmInstallTool: ToolDefinition = {
  name: 'npm_install',
  description: 'Install dependencies inside a project. Can install specific packages (production or dev) or run a clean install of all dependencies.',
  inputSchema: NpmInstallInputSchema,
  async execute(input, context) {
    const { packages, directory, saveDev } = input as {
      packages?: string[];
      directory?: string;
      saveDev: boolean;
    };

    const workspaceRoot = context.workspaceDir ?? process.cwd();
    const cwd = directory ? resolve(workspaceRoot, directory) : workspaceRoot;

    return new Promise((resolvePromise) => {
      const start = Date.now();
      let stdout = '';
      let stderr = '';

      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'npm.cmd' : 'npm';
      const args = ['install'];

      if (packages && packages.length > 0) {
        args.push(...packages);
        if (saveDev) {
          args.push('-D');
        }
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
