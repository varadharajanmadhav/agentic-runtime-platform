import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { sessionRoutes } from './routes/sessions.js';
import { taskRoutes } from './routes/tasks.js';
import { streamRoutes } from './routes/stream.js';
import { toolRoutes } from './routes/tools.js';
import { healthRoutes } from './routes/health.js';
import { modelRoutes } from './routes/models.js';
import { contextRoutes } from './routes/context.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { isTokenBlacklisted } from './routes/auth.js';
import { RATE_LIMIT } from './config/constants.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      userId: string;
      email: string;
      name: string;
      role: string;
      jti?: string;
    };
  }
}

export async function buildApp() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[ARP] JWT_SECRET env var must be set and at least 16 characters long in production.',
      );
    }
    console.warn('[ARP] WARNING: JWT_SECRET is not set or too short. Using an insecure default — DO NOT use this in production.');
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

  // Rate limiting — tighter limits on auth routes, generous global limit
  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT.GLOBAL_MAX,
    timeWindow: RATE_LIMIT.GLOBAL_WINDOW_MS,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests — please slow down.',
    }),
  });

  // Auth routes get their own tighter limit
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url?.startsWith('/api/auth/login') || routeOptions.url?.startsWith('/api/auth/register')) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: RATE_LIMIT.AUTH_MAX,
          timeWindow: RATE_LIMIT.AUTH_WINDOW_MS,
        },
      };
    }
  });

  const apiKey = process.env.ARP_API_KEY;
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.url.startsWith('/health') ||
      request.url.startsWith('/api/auth/') ||
      !request.url.startsWith('/api/')
    ) {
      return;
    }

    // Support optional API key auth
    if (apiKey) {
      const provided = request.headers['x-arp-api-key'];
      if (provided === apiKey) {
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
      // WebSocket connections pass token in query param (can't set headers on WS)
      if (request.url.includes('/ws') && (request.query as any)?.token) {
        const decoded = app.jwt.verify((request.query as any).token) as any;
        // Check token blacklist
        if (decoded?.jti && await isTokenBlacklisted(decoded.jti)) {
          return reply.code(401).send({ success: false, error: 'Token has been revoked' });
        }
        request.user = decoded as any;
        return;
      }

      await request.jwtVerify();

      // Check token blacklist for regular requests
      const payload = request.user as any;
      if (payload?.jti && await isTokenBlacklisted(payload.jti)) {
        return reply.code(401).send({ success: false, error: 'Token has been revoked' });
      }
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
