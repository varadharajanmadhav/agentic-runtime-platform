import { createOpenAI } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';
import type { LanguageModel, EmbeddingModel } from 'ai';
import type { TaskComplexity, ModelProvider } from '@arp/shared';
import { Agent } from 'undici';

const customFetch = (input: string | URL | Request, init?: RequestInit) => {
  return globalThis.fetch(input, {
    ...init,
    dispatcher: new Agent({
      headersTimeout: 15 * 60 * 1000, // 15 minutes to allow slow local prompt processing
      bodyTimeout: 15 * 60 * 1000,    // 15 minutes
      connectTimeout: 60 * 1000,      // 60 seconds
    }),
  } as any);
};

export interface ModelRouterOptions {
  ollamaBaseUrl?: string;
}

export interface RouteConfig {
  provider: ModelProvider;
  model: string;
  ollamaBaseUrl?: string;
}

export interface RouterConfig {
  low: RouteConfig;
  medium: RouteConfig;
  high: RouteConfig;
  embedding: RouteConfig;
}

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Find root path where package.json and packages directory coexist
function getRootPath() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'packages'))) {
      return dir;
    }
    dir = join(dir, '..');
  }
  return process.cwd();
}

const rootPath = getRootPath();
const configFilePath = join(rootPath, 'config.json');
const keysFilePath = join(rootPath, 'keys.json');

export function loadSavedConfig(): Partial<RouterConfig> & { keys?: ModelRouterOptions } {
  const config: Partial<RouterConfig> & { keys?: ModelRouterOptions } = {};
  try {
    if (existsSync(configFilePath)) {
      const data = readFileSync(configFilePath, 'utf8');
      const parsed = JSON.parse(data);
      Object.assign(config, normalizeConfig(parsed));
    }
  } catch (err) {
    console.error('[ARP] Error reading config.json', err);
  }

  try {
    if (existsSync(keysFilePath)) {
      const data = readFileSync(keysFilePath, 'utf8');
      const parsed = JSON.parse(data);
      config.keys = { ollamaBaseUrl: parsed.ollamaBaseUrl || '' };
    } else {
      // Migrate keys from config.json if they exist
      if (existsSync(configFilePath)) {
        const data = readFileSync(configFilePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed.keys) {
          config.keys = { ollamaBaseUrl: parsed.keys.ollamaBaseUrl || '' };
          writeFileSync(keysFilePath, JSON.stringify(config.keys, null, 2), 'utf8');
        }
      }
    }
  } catch (err) {
    console.error('[ARP] Error reading/migrating keys.json', err);
  }
  return config;
}

export function saveConfig(configData: Partial<RouterConfig> & { keys?: ModelRouterOptions }) {
  try {
    const { keys, ...routing } = configData;
    writeFileSync(configFilePath, JSON.stringify(normalizeConfig(routing), null, 2), 'utf8');
    if (keys) {
      writeFileSync(keysFilePath, JSON.stringify({ ollamaBaseUrl: keys.ollamaBaseUrl || '' }, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[ARP] Error writing config.json or keys.json', err);
  }
}

const DEFAULT_CONFIG: RouterConfig = {
  low: {
    provider: 'ollama',
    model: process.env.DEFAULT_LOW_COMPLEXITY_MODEL ?? 'qwen2.5-coder:7b',
  },
  medium: {
    provider: 'ollama',
    model: process.env.DEFAULT_MEDIUM_COMPLEXITY_MODEL ?? 'qwen2.5-coder:32b',
  },
  high: {
    provider: 'ollama',
    model: process.env.DEFAULT_HIGH_COMPLEXITY_MODEL ?? 'qwen2.5-coder:32b',
  },
  embedding: {
    provider: 'ollama',
    model: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
  },
};

function normalizeRoute(route: unknown, fallback: RouteConfig): RouteConfig {
  if (!route || typeof route !== 'object') return fallback;
  const record = route as Partial<RouteConfig>;
  if (record.provider !== 'ollama' || typeof record.model !== 'string' || record.model.trim() === '') {
    return fallback;
  }
  return { 
    provider: 'ollama', 
    model: record.model,
    ollamaBaseUrl: typeof record.ollamaBaseUrl === 'string' ? record.ollamaBaseUrl : undefined
  };
}

function normalizeConfig(config: Partial<RouterConfig>): Partial<RouterConfig> {
  const normalized: Partial<RouterConfig> = {};
  if (config.low !== undefined) normalized.low = normalizeRoute(config.low, DEFAULT_CONFIG.low);
  if (config.medium !== undefined) normalized.medium = normalizeRoute(config.medium, DEFAULT_CONFIG.medium);
  if (config.high !== undefined) normalized.high = normalizeRoute(config.high, DEFAULT_CONFIG.high);
  if (config.embedding !== undefined) normalized.embedding = normalizeRoute(config.embedding, DEFAULT_CONFIG.embedding);
  return normalized;
}

export class ModelRouter {
  private clients = new Map<string, ReturnType<typeof createOllama> | ReturnType<typeof createOpenAI>>();
  private config: RouterConfig;
  private defaultOllamaUrl: string;

  constructor(options: ModelRouterOptions = {}, config?: Partial<RouterConfig>) {
    const saved = loadSavedConfig();
    const { keys = {}, ...savedModels } = saved;

    this.config = { ...DEFAULT_CONFIG, ...normalizeConfig(savedModels), ...normalizeConfig(config ?? {}) } as RouterConfig;
    this.defaultOllamaUrl = options.ollamaBaseUrl ?? keys.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api';
  }

  private getClient(ollamaBaseUrl?: string): ReturnType<typeof createOllama> | ReturnType<typeof createOpenAI> {
    const url = ollamaBaseUrl || this.defaultOllamaUrl;
    if (this.clients.has(url)) {
      return this.clients.get(url)!;
    }

    let client: ReturnType<typeof createOllama> | ReturnType<typeof createOpenAI>;
    if (url.includes('/v1')) {
      client = createOpenAI({
        baseURL: url,
        apiKey: 'lm-studio',
        fetch: customFetch,
      });
    } else {
      client = createOllama({
        baseURL: url,
        fetch: customFetch,
      });
    }

    this.clients.set(url, client);
    return client;
  }

  getModel(complexity: TaskComplexity): LanguageModel {
    const route = this.config[complexity];
    return this.resolveLanguageModel(route.provider, route.model, route.ollamaBaseUrl);
  }

  getRoute(complexity: TaskComplexity): RouteConfig {
    return this.config[complexity];
  }

  getEmbeddingModel(): EmbeddingModel<string> {
    const route = this.config.embedding;
    return this.resolveEmbeddingModel(route.provider, route.model, route.ollamaBaseUrl);
  }

  getModelByProvider(provider: ModelProvider, model: string, ollamaBaseUrl?: string): LanguageModel {
    return this.resolveLanguageModel(provider, model, ollamaBaseUrl);
  }

  private resolveLanguageModel(provider: ModelProvider, model: string, ollamaBaseUrl?: string): LanguageModel {
    switch (provider) {
      case 'ollama': {
        const client = this.getClient(ollamaBaseUrl);
        return client(model);
      }
      default:
        throw new Error(`Unsupported model provider: ${provider}`);
    }
  }

  private resolveEmbeddingModel(provider: ModelProvider, model: string, ollamaBaseUrl?: string): EmbeddingModel<string> {
    switch (provider) {
      case 'ollama': {
        const client = this.getClient(ollamaBaseUrl);
        if (typeof (client as any).embedding === 'function') {
          return (client as any).embedding(model);
        } else if (typeof (client as any).textEmbeddingModel === 'function') {
          return (client as any).textEmbeddingModel(model);
        }
        throw new Error('Ollama provider does not support embeddings in its current configuration');
      }
      default:
        throw new Error(`Unsupported embedding provider: ${provider}`);
    }
  }

  getAvailableProviders(): ModelProvider[] {
    return ['ollama'];
  }
}

// Singleton instance
let routerInstance: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!routerInstance) {
    routerInstance = new ModelRouter();
  }
  return routerInstance;
}

// Force TSX reload comment
export function initModelRouter(options?: ModelRouterOptions, config?: Partial<RouterConfig>): ModelRouter {
  routerInstance = new ModelRouter(options, config);
  return routerInstance;
}
