import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { readdir, stat } from 'fs/promises';
import type { ToolDefinition } from './registry.js';
import { DotnetTestInputSchema } from '@arp/shared';

async function findTestProject(dir: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  try {
    const files = await readdir(dir);
    
    // Prefer projects containing "test" or "Test"
    const testCsproj = files.find(f => f.toLowerCase().includes('test') && f.endsWith('.csproj'));
    if (testCsproj) return join(dir, testCsproj);

    // Otherwise standard csproj
    const csproj = files.find(f => f.endsWith('.csproj'));
    if (csproj) return join(dir, csproj);

    // Recursively check directories
    for (const file of files) {
      if (['node_modules', '.git', 'bin', 'obj', 'dist'].includes(file)) continue;
      const fullPath = join(dir, file);
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        const found = await findTestProject(fullPath, depth + 1);
        if (found) return found;
      }
    }
  } catch (e) {
    // Ignore read errors
  }
  return null;
}

export const dotnetTestTool: ToolDefinition = {
  name: 'dotnet_test',
  description: 'Run unit tests in a .NET/C# solution or project. Supports filtering tests by name/traits.',
  inputSchema: DotnetTestInputSchema,
  async execute(input, context) {
    const { projectPath, filter, configuration, extraArgs } = input as {
      projectPath?: string;
      filter?: string;
      configuration: 'Debug' | 'Release';
      extraArgs?: string[];
    };

    const cwd = context.workspaceDir ?? process.cwd();
    let targetPath = projectPath;

    if (!targetPath) {
      const found = await findTestProject(cwd);
      if (found) {
        targetPath = found;
      }
    }

    return new Promise((resolvePromise) => {
      const start = Date.now();
      let stdout = '';
      let stderr = '';

      const testCmd = 'dotnet';
      const testArgs = ['test'];

      if (targetPath) {
        testArgs.push(targetPath);
      }

      testArgs.push('-c', configuration);

      if (filter) {
        testArgs.push('--filter', filter);
      }

      if (extraArgs && extraArgs.length > 0) {
        testArgs.push(...extraArgs);
      }

      const isWin = process.platform === 'win32';
      const child = spawn(testCmd, testArgs, {
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
            command: `${testCmd} ${testArgs.join(' ')}`,
            projectPath: targetPath ?? 'workspace root',
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
            command: `${testCmd} ${testArgs.join(' ')}`,
          },
          error: err.message,
          durationMs: Date.now() - start,
        });
      });
    });
  },
};
