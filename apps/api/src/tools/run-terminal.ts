import { spawn } from 'child_process';
import { resolve, relative, isAbsolute } from 'path';
import type { ToolDefinition } from './registry.js';
import { RunTerminalInputSchema } from '@arp/shared';

/**
 * CR-4: Block the most destructive/dangerous shell commands.
 * This is a best-effort defense-in-depth measure — full sandboxing
 * (Docker/nsjail) should be used in production deployments.
 */
const COMMAND_DENYLIST: RegExp[] = [
  /\brm\s+-rf\s+\/\b/,                     // rm -rf /
  /\bformat\s+[a-z]:/i,                     // Windows format drive
  /\bdel\s+\/[fqs]+\s+[a-z]:\\/i,           // Windows del /f /s
  /\bdd\s+if=/,                              // dd (disk dump)
  />\s*\/dev\/[sh]d[a-z]/,                  // redirect to raw disk
  /\bmkfs\b/,                                // make filesystem
  /\bshutdown\b/,                            // system shutdown
  /\breboot\b/,                              // system reboot
  /\bpoweroff\b/,                            // power off
  /\bkill\s+-9\s+1\b/,                      // kill init (PID 1)
  /curl.*\|.*sh/,                            // curl-pipe-bash
  /wget.*\|.*sh/,                            // wget-pipe-bash
  /\bchmod\s+777\s+\//,                     // chmod 777 /
  /\bchown\s+.*\s+\//,                      // chown /
];

function checkCommandDenylist(command: string): void {
  for (const pattern of COMMAND_DENYLIST) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked by security policy: matches denylist pattern ${pattern.source}`);
    }
  }
}

function resolveAndValidateCwd(workingDirectory: string | undefined, workspaceDir: string | undefined): string {
  const cwd = workingDirectory ?? workspaceDir ?? process.cwd();

  // If workspaceDir is set, ensure cwd stays within it
  if (workspaceDir) {
    const resolvedCwd = resolve(cwd);
    const resolvedWorkspace = resolve(workspaceDir);
    const rel = relative(resolvedWorkspace, resolvedCwd);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      // Fall back to workspace root instead of allowing escape
      console.warn(`[run_terminal] workingDirectory "${cwd}" is outside workspace; falling back to workspace root`);
      return resolvedWorkspace;
    }
    return resolvedCwd;
  }

  return resolve(cwd);
}

export const runTerminalTool: ToolDefinition = {
  name: 'run_terminal',
  description: 'Execute a shell command and return stdout, stderr, and exit code. Dangerous system commands are blocked.',
  inputSchema: RunTerminalInputSchema,
  async execute(input, context) {
    const { command, workingDirectory, timeoutMs, env } = input as {
      command: string;
      workingDirectory?: string;
      timeoutMs: number;
      env?: Record<string, string>;
    };

    // CR-4: Block dangerous commands
    checkCommandDenylist(command);

    const cwd = resolveAndValidateCwd(workingDirectory, context.workspaceDir ?? undefined);

    return new Promise((resolve) => {
      const start = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const isWin = process.platform === 'win32';
      const shell = isWin ? 'cmd.exe' : 'sh';
      const shellArgs = isWin ? ['/c', command] : ['-c', command];

      const child = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env, ...env },
        stdio: 'pipe',
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({
          success: exitCode === 0 && !timedOut,
          output: {
            stdout: stdout.slice(0, 50000), // Cap at 50KB
            stderr: stderr.slice(0, 10000),
            exitCode,
            timedOut,
            command,
            cwd,
          },
          error: timedOut ? `Command timed out after ${timeoutMs}ms` : undefined,
          durationMs: Date.now() - start,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          output: { stdout: '', stderr: err.message, exitCode: -1 },
          error: err.message,
          durationMs: Date.now() - start,
        });
      });
    });
  },
};
