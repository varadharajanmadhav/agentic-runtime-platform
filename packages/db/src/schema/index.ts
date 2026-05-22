import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  pgEnum,
  index,
  varchar,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Enums ──────────────────────────────────────────────────────
export const sessionStatusEnum = pgEnum('session_status', [
  'active', 'completed', 'error', 'paused',
]);

export const taskStatusEnum = pgEnum('task_status', [
  'queued', 'planning', 'executing', 'validating',
  'reflecting', 'completed', 'failed', 'cancelled',
]);

export const taskComplexityEnum = pgEnum('task_complexity', [
  'low', 'medium', 'high',
]);

export const messageRoleEnum = pgEnum('message_role', [
  'user', 'assistant', 'system', 'tool',
]);

export const userRoleEnum = pgEnum('user_role', [
  'admin', 'developer', 'reviewer', 'viewer',
]);

export const agentEventTypeEnum = pgEnum('agent_event_type', [
  'task_created', 'task_started', 'task_completed', 'task_failed',
  'plan_created', 'step_started', 'step_completed', 'step_failed',
  'tool_called', 'tool_result', 'token_chunk', 'context_assembled',
  'memory_updated', 'reflection_completed', 'error',
]);

// ── Users ──────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('developer'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('users_email_idx').on(table.email)]);

// ── Sessions ───────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  status: sessionStatusEnum('status').notNull().default('active'),
  userId: uuid('user_id').references(() => users.id),
  workspaceDir: text('workspace_dir'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('sessions_user_id_idx').on(table.userId),
  index('sessions_status_idx').on(table.status),
  index('sessions_created_at_idx').on(table.createdAt),
]);

// ── Messages ───────────────────────────────────────────────────
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls').default([]),
  promptTokens: integer('prompt_tokens').default(0),
  completionTokens: integer('completion_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),
  estimatedCostUsd: doublePrecision('estimated_cost_usd').default(0),
  provider: varchar('provider', { length: 50 }),
  model: varchar('model', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('messages_session_id_idx').on(table.sessionId),
  index('messages_created_at_idx').on(table.createdAt),
]);

// ── Tasks ──────────────────────────────────────────────────────
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description').notNull(),
  status: taskStatusEnum('status').notNull().default('queued'),
  complexity: taskComplexityEnum('complexity').notNull().default('medium'),
  plan: jsonb('plan'),
  result: jsonb('result'),
  allowedTools: jsonb('allowed_tools').default([]),
  workspaceDir: text('workspace_dir'),
  promptTokens: integer('prompt_tokens').default(0),
  completionTokens: integer('completion_tokens').default(0),
  totalTokens: integer('total_tokens').default(0),
  estimatedCostUsd: doublePrecision('estimated_cost_usd').default(0),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('tasks_session_id_idx').on(table.sessionId),
  index('tasks_status_idx').on(table.status),
  index('tasks_created_at_idx').on(table.createdAt),
]);

// ── Agent Events ───────────────────────────────────────────────
export const agentEvents = pgTable('agent_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  type: agentEventTypeEnum('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_events_task_id_idx').on(table.taskId),
  index('agent_events_session_id_idx').on(table.sessionId),
  index('agent_events_timestamp_idx').on(table.timestamp),
  index('agent_events_type_idx').on(table.type),
]);

// ── Tool Executions (Audit Log) ────────────────────────────────
export const toolExecutions = pgTable('tool_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  toolName: varchar('tool_name', { length: 100 }).notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  error: text('error'),
  durationMs: integer('duration_ms'),
  success: boolean('success').notNull().default(false),
  sandboxed: boolean('sandboxed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('tool_executions_task_id_idx').on(table.taskId),
  index('tool_executions_tool_name_idx').on(table.toolName),
  index('tool_executions_created_at_idx').on(table.createdAt),
]);

// ── Workspace Index (AST symbols) ──────────────────────────────
export const workspaceSymbols = pgTable('workspace_symbols', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceDir: text('workspace_dir').notNull(),
  filePath: text('file_path').notNull(),
  language: varchar('language', { length: 50 }).notNull(),
  symbolType: varchar('symbol_type', { length: 50 }).notNull(), // function, class, interface, variable
  name: varchar('name', { length: 255 }).notNull(),
  signature: text('signature'),
  docstring: text('docstring'),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  qdrantId: text('qdrant_id'), // ID in Qdrant vector store
  metadata: jsonb('metadata').notNull().default({}),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('workspace_symbols_workspace_idx').on(table.workspaceDir),
  index('workspace_symbols_file_idx').on(table.filePath),
  index('workspace_symbols_name_idx').on(table.name),
  index('workspace_symbols_type_idx').on(table.symbolType),
]);

// ── Memory Entries ─────────────────────────────────────────────
export const memoryEntries = pgTable('memory_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: varchar('scope', { length: 50 }).notNull(), // session, workspace, team, reflection
  workspaceDir: text('workspace_dir'),
  userId: uuid('user_id').references(() => users.id),
  content: text('content').notNull(),
  summary: text('summary'),
  tags: jsonb('tags').default([]),
  confidence: doublePrecision('confidence').notNull().default(1.0),
  retrievalCount: integer('retrieval_count').notNull().default(0),
  relevanceScore: doublePrecision('relevance_score').notNull().default(1.0),
  qdrantId: text('qdrant_id'),
  sourceTaskId: uuid('source_task_id'),
  pinned: boolean('pinned').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('memory_entries_scope_idx').on(table.scope),
  index('memory_entries_workspace_idx').on(table.workspaceDir),
  index('memory_entries_relevance_idx').on(table.relevanceScore),
]);

// ── Policies (Skills + Rules) ──────────────────────────────────
export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull().unique(),
  description: text('description'),
  definition: jsonb('definition').notNull(), // YAML-like structured policy
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('policies_name_idx').on(table.name)]);

// ── Relations ──────────────────────────────────────────────────
export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  messages: many(messages),
  tasks: many(tasks),
  events: many(agentEvents),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  session: one(sessions, { fields: [tasks.sessionId], references: [sessions.id] }),
  events: many(agentEvents),
  toolExecutions: many(toolExecutions),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(sessions, { fields: [messages.sessionId], references: [sessions.id] }),
}));
