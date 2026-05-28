import type { FastifyPluginAsync } from 'fastify';
import { getModelRouter, initModelRouter, loadSavedConfig, saveConfig } from '@arp/ai';
import { z } from 'zod';
import { requireAdmin } from '../lib/auth.js';

const defaultModels = {
  low: { provider: 'ollama', model: 'qwen2.5-coder:7b' },
  medium: { provider: 'ollama', model: 'qwen2.5-coder:32b' },
  high: { provider: 'ollama', model: 'qwen2.5-coder:32b' },
  embedding: { provider: 'ollama', model: 'nomic-embed-text' },
} as const;

function localRouteOrDefault(route: unknown, fallback: { provider: 'ollama'; model: string; ollamaBaseUrl?: string }) {
  if (!route || typeof route !== 'object') return fallback;
  const record = route as { provider?: unknown; model?: unknown; ollamaBaseUrl?: unknown };
  if (record.provider !== 'ollama' || typeof record.model !== 'string' || record.model.trim() === '') {
    return fallback;
  }
  return { 
    provider: 'ollama' as const, 
    model: record.model,
    ollamaBaseUrl: typeof record.ollamaBaseUrl === 'string' ? record.ollamaBaseUrl : undefined
  };
}

export const modelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/providers', async () => {
    const router = getModelRouter();
    return {
      success: true,
      data: {
        available: router.getAvailableProviders(),
      },
    };
  });

  fastify.get('/local-models', async (request, reply) => {
    const { baseUrl } = request.query as { baseUrl?: string };
    const saved = loadSavedConfig();
    const resolvedUrl = baseUrl || saved.keys?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api';
    
    try {
      if (resolvedUrl.includes('/v1')) {
        const res = await fetch(`${resolvedUrl}/models`, {
          headers: { 'Authorization': 'Bearer lm-studio' }
        });
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const json = (await res.json()) as { data?: Array<{ id: string }> };
        const models = json.data?.map(m => m.id) || [];
        return { success: true, data: models };
      } else {
        const tagsUrl = resolvedUrl.endsWith('/api') ? `${resolvedUrl}/tags` : `${resolvedUrl}/api/tags`;
        const res = await fetch(tagsUrl);
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const json = (await res.json()) as { models?: Array<{ name: string }> };
        const models = json.models?.map(m => m.name) || [];
        return { success: true, data: models };
      }
    } catch (err: any) {
      return { success: false, error: `Failed to fetch models: ${err.message}`, data: [] };
    }
  });

  fastify.get('/config', { preHandler: requireAdmin }, async () => {
    const router = getModelRouter();
    const saved = loadSavedConfig();
    const { keys = {}, ...models } = saved;

    const maskedKeys = {
      ollamaBaseUrl: keys.ollamaBaseUrl || '',
    };

    return {
      success: true,
      data: {
        models: {
          low: localRouteOrDefault(models.low, defaultModels.low),
          medium: localRouteOrDefault(models.medium, defaultModels.medium),
          high: localRouteOrDefault(models.high, defaultModels.high),
          embedding: localRouteOrDefault(models.embedding, defaultModels.embedding),
        },
        keys: maskedKeys,
        maxContextWindow: saved.maxContextWindow || null,
        disableThinking: saved.disableThinking || false,
        availableProviders: router.getAvailableProviders(),
      },
    };
  });

  fastify.post('/config', { preHandler: requireAdmin }, async (request, reply) => {
    // M-2: Validate model config body with Zod schema
    const RouteConfigSchema = z.object({
      provider: z.literal('ollama'),
      model: z.string().min(1).max(200),
      ollamaBaseUrl: z.string().optional().or(z.null()),
    });
    const BodySchema = z.object({
      models: z.object({
        low: RouteConfigSchema.optional(),
        medium: RouteConfigSchema.optional(),
        high: RouteConfigSchema.optional(),
        embedding: RouteConfigSchema.optional(),
      }).optional(),
      keys: z.object({
        ollamaBaseUrl: z.string().url().optional().or(z.literal('')),
      }).optional(),
      maxContextWindow: z.number().int().min(1024).max(200000).optional().or(z.null()),
      disableThinking: z.boolean().optional(),
    });

    const parsed = BodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid config body', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const currentConfig = loadSavedConfig();
    const currentKeys = currentConfig.keys || {};

    const newKeys = {
      ollamaBaseUrl: body.keys?.ollamaBaseUrl !== undefined ? body.keys.ollamaBaseUrl : (currentKeys.ollamaBaseUrl || ''),
    };

    const cleanRoute = (route: any) => {
      if (!route) return undefined;
      return {
        provider: route.provider,
        model: route.model,
        ollamaBaseUrl: route.ollamaBaseUrl || undefined,
      };
    };

    const newConfig = {
      low: cleanRoute(body.models?.low),
      medium: cleanRoute(body.models?.medium),
      high: cleanRoute(body.models?.high),
      embedding: cleanRoute(body.models?.embedding),
      maxContextWindow: body.maxContextWindow || undefined,
      disableThinking: body.disableThinking !== undefined ? body.disableThinking : undefined,
      keys: newKeys,
    };

    saveConfig(newConfig);
    initModelRouter(); // Rebuild router singleton with new configurations

    return {
      success: true,
      message: 'Configuration updated successfully',
    };
  });
};
