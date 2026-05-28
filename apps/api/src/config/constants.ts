// Central place for all tunable magic numbers.
// Update here to affect every consumer — don't inline these values.

export const AGENT = {
  MAX_STEPS: 20,
  TOKEN_HISTORY_TRIM: 10_000,
  TOKENS_PER_TOOL_SCHEMA: 200,
  PLAN_MAX_TOKENS: 500,
  CONTEXT_HISTORY_LIMIT: 10,
  TOOL_TIMEOUT_MS: 60_000,
} as const;

export const STREAM = {
  HEARTBEAT_MS: 30_000,
  MAX_WS_LIFETIME_MS: 3_600_000, // 1 hour
} as const;

export const INDEXING = {
  DEBOUNCE_MS: 300,
  STABILITY_THRESHOLD_MS: 300,
  POLL_INTERVAL_MS: 100,
  MAX_POLLS: 150,
  TTL_SECONDS: 86_400,
} as const;

export const QUEUE = {
  TASK_QUEUE_NAME: 'arp-tasks',
  MAX_ATTEMPTS: 3,
  BACKOFF_DELAY_MS: 2_000,
  REMOVE_ON_COMPLETE_COUNT: 100,
  REMOVE_ON_FAIL_COUNT: 500,
} as const;

export const AUTH = {
  TOKEN_TTL: '24h',
  TOKEN_TTL_SECONDS: 86_400,
  BLACKLIST_PREFIX: 'arp:token:blacklist:',
  PASSWORD_MIN_LENGTH: 12,
  PBKDF2_ITERATIONS: 310_000,
} as const;

export const PAGINATION = {
  MESSAGES_DEFAULT_LIMIT: 50,
  MESSAGES_MAX_LIMIT: 200,
  TASKS_DEFAULT_LIMIT: 50,
  TASKS_MAX_LIMIT: 200,
} as const;

export const RATE_LIMIT = {
  AUTH_MAX: 5,
  AUTH_WINDOW_MS: 60_000,
  GLOBAL_MAX: 200,
  GLOBAL_WINDOW_MS: 60_000,
} as const;
