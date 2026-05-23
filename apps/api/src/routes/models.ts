import type { FastifyPluginAsync } from 'fastify';
import { getModelRouter, initModelRouter, loadSavedConfig, saveConfig } from '@arp/ai';
import { z } from 'zod';

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

  fastify.get('/config', async () => {
    const router = getModelRouter();
    const saved = loadSavedConfig();
    const { keys = {}, ...models } = saved;

    // Mask keys
    const maskedKeys = {
      ollamaBaseUrl: keys.ollamaBaseUrl || '',
      openaiApiKey: keys.openaiApiKey ? '*****' : '',
      anthropicApiKey: keys.anthropicApiKey ? '*****' : '',
      googleApiKey: keys.googleApiKey ? '*****' : '',
      groqApiKey: keys.groqApiKey ? '*****' : '',
    };

    return {
      success: true,
      data: {
        models: {
          low: models.low || { provider: 'ollama', model: 'qwen2.5-coder:7b' },
          medium: models.medium || { provider: 'ollama', model: 'qwen2.5-coder:32b' },
          high: models.high || { provider: 'ollama', model: 'qwen2.5-coder:32b' },
          embedding: models.embedding || { provider: 'ollama', model: 'nomic-embed-text' },
        },
        keys: maskedKeys,
        availableProviders: router.getAvailableProviders(),
      },
    };
  });

  fastify.post('/config', async (request, reply) => {
    // M-2: Validate model config body with Zod schema
    const RouteConfigSchema = z.object({
      provider: z.enum(['ollama', 'openai', 'anthropic', 'google', 'groq']),
      model: z.string().min(1).max(200),
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
        openaiApiKey: z.string().optional(),
        anthropicApiKey: z.string().optional(),
        googleApiKey: z.string().optional(),
        groqApiKey: z.string().optional(),
      }).optional(),
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
      openaiApiKey: body.keys?.openaiApiKey !== undefined && body.keys.openaiApiKey !== '*****' ? body.keys.openaiApiKey : (currentKeys.openaiApiKey || ''),
      anthropicApiKey: body.keys?.anthropicApiKey !== undefined && body.keys.anthropicApiKey !== '*****' ? body.keys.anthropicApiKey : (currentKeys.anthropicApiKey || ''),
      googleApiKey: body.keys?.googleApiKey !== undefined && body.keys.googleApiKey !== '*****' ? body.keys.googleApiKey : (currentKeys.googleApiKey || ''),
      groqApiKey: body.keys?.groqApiKey !== undefined && body.keys.groqApiKey !== '*****' ? body.keys.groqApiKey : (currentKeys.groqApiKey || ''),
    };

    const newConfig = {
      low: body.models?.low,
      medium: body.models?.medium,
      high: body.models?.high,
      embedding: body.models?.embedding,
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
