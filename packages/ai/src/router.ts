import { createOpenAI } from '@ai-sdk/openai';
import { createOllama } from 'ollama-ai-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
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
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
  groqApiKey?: string;
}

export interface RouteConfig {
  provider: ModelProvider;
  model: string;
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
      config.low = parsed.low;
      config.medium = parsed.medium;
      config.high = parsed.high;
      config.embedding = parsed.embedding;
    }
  } catch (err) {
    console.error('[ARP] Error reading config.json', err);
  }

  try {
    if (existsSync(keysFilePath)) {
      const data = readFileSync(keysFilePath, 'utf8');
      config.keys = JSON.parse(data);
    } else {
      // Migrate keys from config.json if they exist
      if (existsSync(configFilePath)) {
        const data = readFileSync(configFilePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed.keys) {
          config.keys = parsed.keys;
          writeFileSync(keysFilePath, JSON.stringify(parsed.keys, null, 2), 'utf8');
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
    writeFileSync(configFilePath, JSON.stringify(routing, null, 2), 'utf8');
    if (keys) {
      writeFileSync(keysFilePath, JSON.stringify(keys, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[ARP] Error writing config.json or keys.json', err);
  }
}

const DEFAULT_CONFIG: RouterConfig = {
  low: {
    provider: (process.env.DEFAULT_LOW_COMPLEXITY_PROVIDER as ModelProvider) ?? 'ollama',
    model: process.env.DEFAULT_LOW_COMPLEXITY_MODEL ?? 'qwen2.5-coder:7b',
  },
  medium: {
    provider: (process.env.DEFAULT_MEDIUM_COMPLEXITY_PROVIDER as ModelProvider) ?? 'ollama',
    model: process.env.DEFAULT_MEDIUM_COMPLEXITY_MODEL ?? 'qwen2.5-coder:32b',
  },
  high: {
    provider: (process.env.DEFAULT_HIGH_COMPLEXITY_PROVIDER as ModelProvider) ?? 'ollama',
    model: process.env.DEFAULT_HIGH_COMPLEXITY_MODEL ?? 'qwen2.5-coder:32b',
  },
  embedding: {
    provider: (process.env.EMBEDDING_PROVIDER as ModelProvider) ?? 'ollama',
    model: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
  },
};

export class ModelRouter {
  private ollama: ReturnType<typeof createOllama> | ReturnType<typeof createOpenAI>;
  private openai: ReturnType<typeof createOpenAI>;
  private anthropic: ReturnType<typeof createAnthropic>;
  private google: ReturnType<typeof createGoogleGenerativeAI>;
  private groq: ReturnType<typeof createOpenAI>;
  private config: RouterConfig;

  constructor(options: ModelRouterOptions = {}, config?: Partial<RouterConfig>) {
    const saved = loadSavedConfig();
    const { keys = {}, ...savedModels } = saved;

    this.config = { ...DEFAULT_CONFIG, ...savedModels, ...config } as RouterConfig;

    const ollamaUrl = options.ollamaBaseUrl ?? keys.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api';
    if (ollamaUrl.includes('/v1')) {
      this.ollama = createOpenAI({
        baseURL: ollamaUrl,
        apiKey: 'lm-studio',
        fetch: customFetch,
      });
    } else {
      this.ollama = createOllama({
        baseURL: ollamaUrl,
        fetch: customFetch,
      });
    }

    const openaiKey = options.openaiApiKey ?? keys.openaiApiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.openai = createOpenAI({
      apiKey: openaiKey || 'dummy-key',
      fetch: customFetch,
    });

    const anthropicKey = options.anthropicApiKey ?? keys.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.anthropic = createAnthropic({
      apiKey: anthropicKey || 'dummy-key',
      fetch: customFetch,
    });

    const googleKey = options.googleApiKey ?? keys.googleApiKey ?? process.env.GOOGLE_API_KEY ?? '';
    this.google = createGoogleGenerativeAI({
      apiKey: googleKey || 'dummy-key',
      fetch: customFetch,
    });

    const groqKey = options.groqApiKey ?? keys.groqApiKey ?? process.env.GROQ_API_KEY ?? '';
    this.groq = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: groqKey || 'dummy-key',
      fetch: customFetch,
    });
  }

  getModel(complexity: TaskComplexity): LanguageModel {
    const route = this.config[complexity];
    return this.resolveLanguageModel(route.provider, route.model);
  }

  getRoute(complexity: TaskComplexity): RouteConfig {
    return this.config[complexity];
  }

  getEmbeddingModel(): EmbeddingModel<string> {
    const route = this.config.embedding;
    return this.resolveEmbeddingModel(route.provider, route.model);
  }

  getModelByProvider(provider: ModelProvider, model: string): LanguageModel {
    return this.resolveLanguageModel(provider, model);
  }

  private resolveLanguageModel(provider: ModelProvider, model: string): LanguageModel {
    switch (provider) {
      case 'ollama':
        return this.ollama(model);
      case 'openai':
        return this.openai(model);
      case 'anthropic':
        return this.anthropic(model);
      case 'google':
        return this.google(model);
      case 'groq':
        return this.groq(model);
      default:
        throw new Error(`Unsupported model provider: ${provider}`);
    }
  }

  private resolveEmbeddingModel(provider: ModelProvider, model: string): EmbeddingModel<string> {
    switch (provider) {
      case 'ollama':
        if (typeof (this.ollama as any).embedding === 'function') {
          return (this.ollama as any).embedding(model);
        } else if (typeof (this.ollama as any).textEmbeddingModel === 'function') {
          return (this.ollama as any).textEmbeddingModel(model);
        }
        throw new Error('Ollama provider does not support embeddings in its current configuration');
      case 'openai':
        return this.openai.embedding(model);
      case 'google':
        return this.google.textEmbeddingModel(model);
      default:
        // Fallback to ollama
        if (typeof (this.ollama as any).embedding === 'function') {
          return (this.ollama as any).embedding('nomic-embed-text');
        } else if (typeof (this.ollama as any).textEmbeddingModel === 'function') {
          return (this.ollama as any).textEmbeddingModel('nomic-embed-text');
        }
        throw new Error('Ollama provider does not support embeddings in its current configuration');
    }
  }

  getAvailableProviders(): ModelProvider[] {
    return ['ollama', 'openai', 'anthropic', 'google', 'groq'];
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
