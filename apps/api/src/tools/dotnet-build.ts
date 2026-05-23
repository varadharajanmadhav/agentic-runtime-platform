import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { readdir, stat } from 'fs/promises';
import type { ToolDefinition } from './registry.js';
import { DotnetBuildInputSchema } from '@arp/shared';

async function findProjectOrSolution(dir: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  try {
    const files = await readdir(dir);
    
    // Check for solutions first
    const slnFile = files.find(f => f.endsWith('.sln'));
    if (slnFile) return join(dir, slnFile);

    // Check for csproj next
    const csprojFile = files.find(f => f.endsWith('.csproj'));
    if (csprojFile) return join(dir, csprojFile);

    // Traverse subdirectories
    for (const file of files) {
      if (['node_modules', '.git', 'bin', 'obj', 'dist'].includes(file)) continue;
      const fullPath = join(dir, file);
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        const found = await findProjectOrSolution(fullPath, depth + 1);
        if (found) return found;
      }
    }
  } catch (e) {
    // Ignore folder read errors
  }
  return null;
}

export const dotnetBuildTool: ToolDefinition = {
  name: 'dotnet_build',
  description: 'Compile and build .NET/C# projects or solutions. Supports package restoration, Debug/Release targets, and msbuild fallback for legacy WCF/.NET Framework projects.',
  inputSchema: DotnetBuildInputSchema,
  async execute(input, context) {
    const { projectPath, configuration, clean, restore, msbuildPath, extraArgs } = input as {
      projectPath?: string;
      configuration: 'Debug' | 'Release';
      clean: boolean;
      restore: boolean;
      msbuildPath?: string;
      extraArgs?: string[];
    };

    const cwd = context.workspaceDir ?? process.cwd();
    let targetPath = projectPath;

    if (!targetPath) {
      const found = await findProjectOrSolution(cwd);
      if (found) {
        targetPath = found;
      }
    }

    return new Promise((resolvePromise) => {
      const start = Date.now();
      let stdout = '';
      let stderr = '';

      let buildCmd = 'dotnet';
      const buildArgs: string[] = [];

      if (msbuildPath) {
        buildCmd = msbuildPath;
      } else {
        buildArgs.push('build');
      }

      if (targetPath) {
        buildArgs.push(targetPath);
      }

      if (msbuildPath) {
        buildArgs.push(`/p:Configuration=${configuration}`);
      } else {
        buildArgs.push('-c', configuration);
      }

      if (!restore && !msbuildPath) {
        buildArgs.push('--no-restore');
      }

      if (clean) {
        if (msbuildPath) {
          buildArgs.push('/t:Clean,Build');
        } else {
          buildArgs.push('/t:Clean;Build');
        }
      }

      if (extraArgs && extraArgs.length > 0) {
        buildArgs.push(...extraArgs);
      }

      const isWin = process.platform === 'win32';
      const child = spawn(buildCmd, buildArgs, {
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
            command: `${buildCmd} ${buildArgs.join(' ')}`,
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
            command: `${buildCmd} ${buildArgs.join(' ')}`,
          },
          error: err.message,
          durationMs: Date.now() - start,
        });
      });
    });
  },
};
