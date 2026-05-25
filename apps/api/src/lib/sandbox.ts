import { relative, resolve } from 'path';

interface SandboxOptions {
  command: string;
  cwd: string;
  workspaceDir?: string;
}

interface WrappedCommand {
  command: string;
  args: string[];
}

/**
 * Wraps a shell command to execute inside a Docker container if sandbox mode is active.
 * Otherwise, falls back to the native shell on the host OS.
 */
export function wrapCommandForSandbox(options: SandboxOptions): WrappedCommand {
  const sandboxMode = process.env.SANDBOX_MODE;

  if (sandboxMode === 'docker' && options.workspaceDir) {
    const resolvedWorkspace = resolve(options.workspaceDir);
    const resolvedCwd = resolve(options.cwd);

    // Compute the relative directory within the workspace to set the container working directory
    let relDir = relative(resolvedWorkspace, resolvedCwd).replace(/\\/g, '/');
    if (relDir.startsWith('..') || relDir.startsWith('/')) {
      relDir = '';
    }
    const containerCwd = relDir ? `/workspace/${relDir}` : '/workspace';

    // Mount the workspace folder to /workspace, and execute the command via shell
    return {
      command: 'docker',
      args: [
        'run',
        '--rm',
        '-i',
        '-v',
        `${resolvedWorkspace}:/workspace`,
        '-w',
        containerCwd,
        'node:20-alpine',
        'sh',
        '-c',
        options.command,
      ],
    };
  }

  // Host native execution fallback
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'cmd.exe' : 'sh';
  const shellArgs = isWin ? ['/c', options.command] : ['-c', options.command];

  return {
    command: shell,
    args: shellArgs,
  };
}
