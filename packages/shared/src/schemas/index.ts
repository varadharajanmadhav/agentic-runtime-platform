import { z } from 'zod';

// ── Session schemas ────────────────────────────────────────────
export const CreateSessionSchema = z.object({
  title: z.string().min(1).max(200),
  workspaceDir: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const UpdateSessionSchema = CreateSessionSchema.partial();

// ── Task schemas ───────────────────────────────────────────────
export const CreateTaskSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  complexity: z.enum(['low', 'medium', 'high']).default('medium'),
  workspaceDir: z.string().nullable().optional(),
  allowedTools: z.array(z.string()).optional(),
});

// ── Tool schemas ───────────────────────────────────────────────
export const ReadFileInputSchema = z.object({
  path: z.string().min(1).describe('Absolute or relative path to the file to read'),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
  startLine: z.number().int().positive().optional().describe('Start line (1-indexed)'),
  endLine: z.number().int().positive().optional().describe('End line (1-indexed, inclusive)'),
});

export const WriteFileInputSchema = z.object({
  path: z.string().min(1).describe('Absolute or relative path to write'),
  content: z.string().describe('File content to write'),
  createDirectories: z.boolean().default(true).describe('Create parent directories if missing'),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
});

export const RunTerminalInputSchema = z.object({
  command: z.string().min(1).describe('Shell command to execute'),
  workingDirectory: z.string().optional().describe('Working directory for the command'),
  timeoutMs: z.number().int().positive().default(30000).describe('Timeout in milliseconds'),
  env: z.record(z.string()).optional().describe('Additional environment variables'),
});

export const SearchFilesInputSchema = z.object({
  query: z.string().min(1).describe('Search query (regex or literal string)'),
  directory: z.string().default('.').describe('Directory to search in'),
  filePattern: z.string().optional().describe('Glob pattern to filter files, e.g. "*.ts"'),
  isRegex: z.boolean().default(false),
  caseSensitive: z.boolean().default(true),
  maxResults: z.number().int().positive().default(50),
  includeLineNumbers: z.boolean().default(true),
});

export const GitDiffInputSchema = z.object({
  directory: z.string().default('.').describe('Git repository directory'),
  staged: z.boolean().default(false).describe('Show staged changes'),
  commit: z.string().optional().describe('Compare with specific commit/branch'),
  file: z.string().optional().describe('Diff a specific file'),
});

export const WebFetchInputSchema = z.object({
  url: z.string().url().describe('URL to fetch'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().int().positive().default(15000),
});

export const GitLogInputSchema = z.object({
  directory: z.string().default('.').describe('Git repository directory'),
  limit: z.number().int().positive().default(10).describe('Number of commits to return'),
  file: z.string().optional().describe('Filter commits by file path'),
});

export const GitShowInputSchema = z.object({
  directory: z.string().default('.').describe('Git repository directory'),
  commit: z.string().default('HEAD').describe('Commit hash or reference to show'),
  file: z.string().optional().describe('Filter diff by file path'),
});

export const DotnetBuildInputSchema = z.object({
  projectPath: z.string().optional().describe('Path to the solution (.sln) or project (.csproj) file'),
  configuration: z.enum(['Debug', 'Release']).default('Debug').describe('Build configuration'),
  clean: z.boolean().default(false).describe('Run clean target before building'),
  restore: z.boolean().default(true).describe('Restore NuGet packages before building'),
  msbuildPath: z.string().optional().describe('Optional path to msbuild.exe for legacy .NET Framework/WCF projects'),
  extraArgs: z.array(z.string()).optional().describe('Additional command line arguments for the build'),
});

export const DotnetTestInputSchema = z.object({
  projectPath: z.string().optional().describe('Path to the test project or solution'),
  filter: z.string().optional().describe('Test case filter expression, e.g. FullyQualifiedName~MyTests'),
  configuration: z.enum(['Debug', 'Release']).default('Debug'),
  extraArgs: z.array(z.string()).optional(),
});

export const NpmRunInputSchema = z.object({
  script: z.string().describe('The npm script to run, e.g. "build", "test"'),
  directory: z.string().optional().describe('Directory to run the npm command in'),
  extraArgs: z.array(z.string()).optional(),
});

export const NpmInstallInputSchema = z.object({
  packages: z.array(z.string()).optional().describe('List of packages to install. If empty, runs npm install'),
  directory: z.string().optional().describe('Directory to run npm install in'),
  saveDev: z.boolean().default(false).describe('Save package to devDependencies'),
});

// ── Auth schemas ───────────────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const JwtPayloadSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'developer', 'reviewer', 'viewer']),
  iat: z.number(),
  exp: z.number(),
});

// ── Model config schema ────────────────────────────────────────
export const ModelConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic', 'google', 'groq']),
  model: z.string(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;
export type WriteFileInput = z.infer<typeof WriteFileInputSchema>;
export type RunTerminalInput = z.infer<typeof RunTerminalInputSchema>;
export type SearchFilesInput = z.infer<typeof SearchFilesInputSchema>;
export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;
export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;
export type GitLogInput = z.infer<typeof GitLogInputSchema>;
export type GitShowInput = z.infer<typeof GitShowInputSchema>;
export type DotnetBuildInput = z.infer<typeof DotnetBuildInputSchema>;
export type DotnetTestInput = z.infer<typeof DotnetTestInputSchema>;
export type NpmRunInput = z.infer<typeof NpmRunInputSchema>;
export type NpmInstallInput = z.infer<typeof NpmInstallInputSchema>;
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
