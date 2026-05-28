import type { FastifyPluginAsync } from 'fastify';
import { getPool } from '@arp/db';
import { getRedisClient } from '../lib/redis.js';
import { getQdrantClient } from '../lib/qdrant.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    // Check PostgreSQL
    try {
      const client = await getPool().connect();
      await client.query('SELECT 1');
      client.release();
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    // Check Redis
    try {
      const redis = getRedisClient();
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    // Check Qdrant
    try {
      const qdrant = getQdrantClient();
      await qdrant.getCollections();
      checks.qdrant = 'ok';
    } catch {
      checks.qdrant = 'error';
    }

    const allOk = Object.values(checks).every(v => v === 'ok');

    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'healthy' : 'degraded',
      checks,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });
};
