import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  QDRANT_URL: z.string().default('http://localhost:6333'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(3),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434/api'),
  CORS_ORIGINS: z.string().default(''),
  ARP_API_KEY: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  DEFAULT_LOW_COMPLEXITY_MODEL: z.string().default('qwen2.5-coder:7b'),
  DEFAULT_MEDIUM_COMPLEXITY_MODEL: z.string().default('qwen2.5-coder:32b'),
  DEFAULT_HIGH_COMPLEXITY_MODEL: z.string().default('qwen2.5-coder:32b'),
  EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;

export function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[ARP] ❌ Invalid environment configuration — cannot start:');
    result.error.issues.forEach(issue => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) {
    return validateEnv();
  }
  return _env;
}
