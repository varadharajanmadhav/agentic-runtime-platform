import type { FastifyPluginAsync } from 'fastify';
import { getToolRegistry } from '../tools/registry.js';

export const toolRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async () => {
    const registry = getToolRegistry();
    return {
      success: true,
      data: registry.listTools().map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });
};
