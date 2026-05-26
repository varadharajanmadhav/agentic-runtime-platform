// Session types
export type SessionStatus = 'active' | 'completed' | 'error' | 'paused';

export interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  userId?: string;
  workspaceDir?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

// Task types
export type TaskStatus = 'queued' | 'planning' | 'executing' | 'validating' | 'reflecting' | 'completed' | 'failed' | 'cancelled';
export type TaskComplexity = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  sessionId: string;
  title: string;
  description: string;
  status: TaskStatus;
  complexity: TaskComplexity;
  plan?: ExecutionPlan;
  result?: TaskResult;
  tokenUsage?: TokenUsage;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskResult {
  success: boolean;
  output: string;
  artifacts?: string[];
  failureReason?: string;
  retryCount: number;
  contextItems?: Array<{
    id: string;
    type: 'file' | 'symbol' | 'git_diff' | 'terminal_output' | 'memory' | 'documentation';
    path?: string;
    relevanceScore: number;
    tokenCount: number;
    metadata?: Record<string, unknown>;
  }>;
}

// Execution types
export interface ExecutionPlan {
  steps: PlanStep[];
  totalEstimatedTokens: number;
}

export interface PlanStep {
  id: string;
  description: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  dependsOn?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
}

// Event types
export type AgentEventType =
  | 'task_created'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'plan_created'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'tool_called'
  | 'tool_result'
  | 'token_chunk'
  | 'context_assembled'
  | 'memory_updated'
  | 'reflection_completed'
  | 'error';

export interface AgentEvent {
  id: string;
  taskId: string;
  sessionId: string;
  type: AgentEventType;
  payload: Record<string, unknown>;
  timestamp: Date;
}

// Token/Cost types
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  provider: string;
  model: string;
}

// Tool types
export type ToolPermission = 'read_file' | 'write_file' | 'run_terminal' | 'search_files' | 'print_tree' | 'git_diff' | 'web_fetch' | 'mcp' | 'git_log' | 'git_show' | 'dotnet_build' | 'dotnet_test' | 'npm_run' | 'npm_install';

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  durationMs?: number;
  timestamp: Date;
}

// Context types
export interface ContextItem {
  id: string;
  type: 'file' | 'symbol' | 'git_diff' | 'terminal_output' | 'memory' | 'documentation';
  content: string;
  path?: string;
  relevanceScore: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

export interface AssembledContext {
  items: ContextItem[];
  totalTokens: number;
  budgetTokens: number;
  compressionApplied: boolean;
}

// Message types
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  tokenUsage?: TokenUsage;
  provider?: string | null;
  model?: string | null;
  createdAt: Date;
}

// Model provider types
export type ModelProvider = 'ollama';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  ollamaBaseUrl?: string;
}

export interface ModelRouterConfig {
  low: ModelConfig;
  medium: ModelConfig;
  high: ModelConfig;
  embedding: ModelConfig;
}

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'developer' | 'reviewer' | 'viewer';
  createdAt: Date;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

// SSE Event types (for streaming)
export interface SseEvent {
  event: AgentEventType | 'ping' | 'done';
  data: Record<string, unknown>;
}
