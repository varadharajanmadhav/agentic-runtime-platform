import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { getDb, agentEvents, eq, desc } from '@arp/db';
import { getEventEmitter } from '../lib/events.js';
import { STREAM } from '../config/constants.js';

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  // SSE stream for a specific task
  // Auth is enforced by the global onRequest hook in app.ts
  fastify.get<{ Params: { taskId: string } }>('/task/:taskId', async (request, reply) => {
    const { taskId } = request.params;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const emitter = getEventEmitter();
    const channel = `task:${taskId}`;

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send historical events first
    const db = getDb();
    const history = await db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.taskId, taskId))
      .orderBy(agentEvents.timestamp);

    for (const event of history) {
      sendEvent(event.type, event.payload);
    }

    const handler = (data: unknown) => {
      if (typeof data === 'object' && data !== null && 'type' in data) {
        const e = data as { type: string; payload: unknown };
        sendEvent(e.type, e.payload);
      }
    };

    emitter.on(channel, handler);

    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, STREAM.HEARTBEAT_MS);

    // Auto-disconnect after max lifetime to prevent resource leaks
    const maxLifetime = setTimeout(() => {
      reply.raw.end();
    }, STREAM.MAX_WS_LIFETIME_MS);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      clearTimeout(maxLifetime);
      emitter.off(channel, handler);
    });

    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve);
    });
  });

  // SSE stream for a session (all tasks)
  fastify.get<{ Params: { sessionId: string } }>('/session/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const emitter = getEventEmitter();
    const channel = `session:${sessionId}`;

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const handler = (data: unknown) => {
      if (typeof data === 'object' && data !== null && 'type' in data) {
        const e = data as { type: string; payload: unknown };
        sendEvent(e.type, e.payload);
      }
    };

    emitter.on(channel, handler);
    const heartbeat = setInterval(() => { reply.raw.write(': ping\n\n'); }, STREAM.HEARTBEAT_MS);
    const maxLifetime = setTimeout(() => { reply.raw.end(); }, STREAM.MAX_WS_LIFETIME_MS);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      clearTimeout(maxLifetime);
      emitter.off(channel, handler);
    });

    await new Promise<void>((resolve) => { request.raw.on('close', resolve); });
  });

  // WebSocket stream for a specific task — auth handled by global onRequest hook via ?token=
  fastify.get<{ Params: { taskId: string } }>(
    '/task/:taskId/ws',
    { websocket: true },
    async (socket: WebSocket, request: any) => {
      const { taskId } = request.params;
      const emitter = getEventEmitter();
      const channel = `task:${taskId}`;

      const sendWs = (type: string, data: unknown) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type, data }));
        }
      };

      // Replay historical events
      try {
        const db = getDb();
        const history = await db
          .select()
          .from(agentEvents)
          .where(eq(agentEvents.taskId, taskId))
          .orderBy(agentEvents.timestamp);
        for (const event of history) {
          sendWs(event.type, event.payload);
        }
        sendWs('history_end', { taskId });
      } catch {
        sendWs('error', { message: 'Failed to load history' });
      }

      const handler = (event: unknown) => {
        if (typeof event === 'object' && event !== null && 'type' in event) {
          const e = event as { type: string; payload: unknown };
          sendWs(e.type, e.payload);
        }
      };

      emitter.on(channel, handler);

      const heartbeat = setInterval(() => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', data: {} }));
        }
      }, STREAM.HEARTBEAT_MS);

      // Disconnect after max lifetime
      const maxLifetime = setTimeout(() => {
        socket.close(1001, 'Connection max lifetime reached');
      }, STREAM.MAX_WS_LIFETIME_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        clearTimeout(maxLifetime);
        emitter.off(channel, handler);
      };

      socket.on('close', cleanup);
      socket.on('error', cleanup);
    }
  );
};
