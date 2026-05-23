import { z } from 'zod';
import {
  ReadFileInputSchema,
  WriteFileInputSchema,
  RunTerminalInputSchema,
  SearchFilesInputSchema,
  GitDiffInputSchema,
  WebFetchInputSchema,
  GitLogInputSchema,
  GitShowInputSchema,
  DotnetBuildInputSchema,
  DotnetTestInputSchema,
  NpmRunInputSchema,
  NpmInstallInputSchema,
} from '@arp/shared';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { runTerminalTool } from './run-terminal.js';
import { searchFilesTool } from './search-files.js';
import { gitDiffTool } from './git-diff.js';
import { webFetchTool } from './web-fetch.js';
import { gitLogTool } from './git-log.js';
import { gitShowTool } from './git-show.js';
import { dotnetBuildTool } from './dotnet-build.js';
import { dotnetTestTool } from './dotnet-test.js';
import { npmRunTool } from './npm-run.js';
import { npmInstallTool } from './npm-install.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  taskId: string;
  sessionId: string;
  workspaceDir?: string;
  sandboxed?: boolean;
  provider?: string;
  model?: string;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  durationMs: number;
}

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolContext,
    allowedTools?: string[],
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: null, error: `Unknown tool: ${name}`, durationMs: 0 };
    }

    if (allowedTools && !allowedTools.includes(name)) {
      return { success: false, output: null, error: `Tool ${name} not permitted for this task`, durationMs: 0 };
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        output: null,
        error: `Invalid input for tool ${name}: ${parsed.error.message}`,
        durationMs: 0,
      };
    }

    const start = Date.now();
    try {
      const result = await tool.execute(parsed.data, context);
      return { ...result, durationMs: Date.now() - start };
    } catch (err) {
      return {
        success: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  }
}

let registryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry();
    // Register built-in tools
    registryInstance.register(readFileTool);
    registryInstance.register(writeFileTool);
    registryInstance.register(runTerminalTool);
    registryInstance.register(searchFilesTool);
    registryInstance.register(gitDiffTool);
    registryInstance.register(webFetchTool);
    registryInstance.register(gitLogTool);
    registryInstance.register(gitShowTool);
    registryInstance.register(dotnetBuildTool);
    registryInstance.register(dotnetTestTool);
    registryInstance.register(npmRunTool);
    registryInstance.register(npmInstallTool);
  }
  return registryInstance;
}
