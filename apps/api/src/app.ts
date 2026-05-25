import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import { sessionRoutes } from './routes/sessions.js';
import { taskRoutes } from './routes/tasks.js';
import { streamRoutes } from './routes/stream.js';
import { toolRoutes } from './routes/tools.js';
import { healthRoutes } from './routes/health.js';
import { modelRoutes } from './routes/models.js';
import { contextRoutes } from './routes/context.js';

import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      userId: string;
      email: string;
      name: string;
      role: string;
    };
  }
}

export async function buildApp() {
  // CR-5: Require a proper JWT secret — fail fast rather than silently using a known default
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[ARP] JWT_SECRET env var must be set and at least 16 characters long in production. ' +
        'Set it in your .env file.'
      );
    }
    // In development we allow a fallback but warn loudly
    console.warn(
      '[ARP] WARNING: JWT_SECRET is not set or too short. ' +
      'Using an insecure default — DO NOT use this in production.'
    );
  }

  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // Plugins
  await app.register(cors, {
    origin: process.env.NODE_ENV === 'development'
      ? ['http://localhost:5173', 'http://localhost:3000']
      : (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  await app.register(jwt, {
    secret: jwtSecret ?? 'dev-secret-arp-change-in-production',
  });

  await app.register(sensible);
  await app.register(websocket);

  // preValidation / onRequest hook to authenticate routes
  const apiKey = process.env.ARP_API_KEY;
  app.addHook('onRequest', async (request, reply) => {
    // Exclude health, public routes, and auth (including bootstrap)
    if (
      request.url.startsWith('/health') ||
      request.url.startsWith('/api/auth/') ||
      !request.url.startsWith('/api/')
    ) {
      return;
    }

    // Support optional API key auth as fallback (e.g. for simple local testing)
    if (apiKey) {
      const provided = request.headers['x-arp-api-key'];
      if (provided === apiKey) {
        // If an API key is used, mock as admin
        request.user = {
          userId: '00000000-0000-0000-0000-000000000000',
          email: 'admin@arp.local',
          name: 'API Admin',
          role: 'admin',
        };
        return;
      }
    }

    try {
      // Support JWT via query parameter for WebSockets
      if (request.url.includes('/ws') && (request.query as any)?.token) {
        const decoded = app.jwt.verify((request.query as any).token);
        request.user = decoded as any;
        return;
      }

      await request.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ success: false, error: 'Unauthorized: invalid or missing JWT token' });
    }
  });

  if (apiKey) {
    console.log('[ARP] API key authentication enabled');
  } else {
    console.warn('[ARP] WARNING: ARP_API_KEY is not set. All API routes require a valid JWT token.');
  }

  // Routes
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(taskRoutes, { prefix: '/api/tasks' });
  await app.register(streamRoutes, { prefix: '/api/stream' });
  await app.register(toolRoutes, { prefix: '/api/tools' });
  await app.register(modelRoutes, { prefix: '/api/models' });
  await app.register(contextRoutes, { prefix: '/api/context' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  return app;
}
