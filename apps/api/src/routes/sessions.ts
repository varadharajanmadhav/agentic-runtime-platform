import type { FastifyPluginAsync } from 'fastify';
import { CreateSessionSchema, UpdateSessionSchema } from '@arp/shared';
import { getDb, sessions, messages, tasks, desc, eq, and, count, like, or } from '@arp/db';
import { randomUUID } from 'crypto';
import { watchWorkspace, unwatchWorkspace } from '../lib/watcher.js';
import { resolveWorkspaceDir } from '../lib/auth.js';
import { PAGINATION } from '../config/constants.js';

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // List sessions
  fastify.get('/', async (request, reply) => {
    const db = getDb();
    const allSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, request.user.userId))
      .orderBy(desc(sessions.createdAt))
      .limit(50);
    return { success: true, data: allSessions };
  });

  // Get session by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);
    if (!session) return reply.notFound('Session not found');
    return { success: true, data: session };
  });

  // Get session messages — paginated
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/:id/messages',
    async (request, reply) => {
      const db = getDb();
      const [session] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, request.params.id), eq(sessions.userId, request.user.userId)))
        .limit(1);
      if (!session) return reply.notFound('Session not found');

      const limit = Math.min(
        parseInt((request.query as any).limit ?? String(PAGINATION.MESSAGES_DEFAULT_LIMIT)),
        PAGINATION.MESSAGES_MAX_LIMIT,
      );
      const offset = Math.max(0, parseInt((request.query as any).offset ?? '0'));

      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, request.params.id))
        .orderBy(messages.createdAt)
        .limit(limit)
        .offset(offset);

      const [{ value: total }] = await db
        .select({ value: count() })
        .from(messages)
        .where(eq(messages.sessionId, request.params.id));

      return { success: true, data: msgs, meta: { total: Number(total), limit, offset } };
    }
  );

  // Search sessions by title or message content
  fastify.get<{ Querystring: { q: string } }>('/search', async (request, reply) => {
    const q = ((request.query as any).q ?? '').trim();
    if (!q || q.length < 2) return { success: true, data: [] };

    const db = getDb();
    const pattern = `%${q}%`;

    // Sessions whose title matches
    const titleMatches = await db
      .select({ id: sessions.id, title: sessions.title, workspaceDir: sessions.workspaceDir, updatedAt: sessions.updatedAt })
      .from(sessions)
      .where(and(eq(sessions.userId, request.user.userId), like(sessions.title, pattern)))
      .orderBy(desc(sessions.updatedAt))
      .limit(10);

    // Sessions that have a matching message
    const msgMatches = await db
      .select({ sessionId: messages.sessionId, preview: messages.content })
      .from(messages)
      .innerJoin(sessions, and(eq(messages.sessionId, sessions.id), eq(sessions.userId, request.user.userId)))
      .where(like(messages.content, pattern))
      .orderBy(desc(messages.createdAt))
      .limit(20);

    // Merge: collect unique session IDs from message matches
    const msgSessionIds = [...new Set(msgMatches.map(m => m.sessionId))];
    const msgSessionRows = msgSessionIds.length > 0
      ? await db
          .select({ id: sessions.id, title: sessions.title, workspaceDir: sessions.workspaceDir, updatedAt: sessions.updatedAt })
          .from(sessions)
          .where(and(eq(sessions.userId, request.user.userId)))
          .then(rows => rows.filter(r => msgSessionIds.includes(r.id)))
      : [];

    // Deduplicate by session id, title matches first
    const seen = new Set<string>();
    const results: { id: string; title: string; workspaceDir: string | null; updatedAt: Date; preview?: string }[] = [];
    for (const s of [...titleMatches, ...msgSessionRows]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const msg = msgMatches.find(m => m.sessionId === s.id);
      const preview = msg?.preview?.slice(0, 120);
      results.push({ ...s, preview });
    }

    return { success: true, data: results.slice(0, 15) };
  });

  // Create session
  fastify.post('/', async (request, reply) => {
    const body = CreateSessionSchema.parse(request.body);
    const db = getDb();

    const workspaceDir = await resolveWorkspaceDir(
      request.user as any,
      body.workspaceDir ?? undefined,
    );

    const [session] = await db
      .insert(sessions)
      .values({
        id: randomUUID(),
        title: body.title,
        workspaceDir,
        userId: request.user.userId,
        metadata: body.metadata as Record<string, unknown>,
      })
      .returning();

    if (session.workspaceDir) {
      watchWorkspace(session.workspaceDir);
    }

    return reply.status(201).send({ success: true, data: session });
  });

  // Update session
  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = UpdateSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request body', details: parsed.error.flatten() });
    }
    const db = getDb();

    const [existing] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);
    if (!existing) return reply.notFound('Session not found');

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.workspaceDir !== undefined) updates.workspaceDir = parsed.data.workspaceDir;
    const [session] = await db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, request.params.id))
      .returning();
    return { success: true, data: session };
  });

  // Delete session
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [session] = await db
      .select({ workspaceDir: sessions.workspaceDir })
      .from(sessions)
      .where(and(eq(sessions.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);

    if (!session) return reply.notFound('Session not found');

    await db.delete(sessions).where(eq(sessions.id, request.params.id));

    if (session?.workspaceDir) {
      await unwatchWorkspace(session.workspaceDir);
    }

    return { success: true };
  });
};
