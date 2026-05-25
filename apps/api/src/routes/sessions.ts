import type { FastifyPluginAsync } from 'fastify';
import { CreateSessionSchema, UpdateSessionSchema } from '@arp/shared';
import { getDb, sessions, messages, tasks, desc, eq, and, count } from '@arp/db';
import { randomUUID } from 'crypto';
import { watchWorkspace, unwatchWorkspace } from '../lib/watcher.js';
import { resolveWorkspaceDir } from '../lib/auth.js';

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

  // Get session messages
  fastify.get<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const db = getDb();
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);
    if (!session) return reply.notFound('Session not found');
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, request.params.id))
      .orderBy(messages.createdAt);
    return { success: true, data: msgs };
  });

  // Create session
  fastify.post('/', async (request, reply) => {
    const body = CreateSessionSchema.parse(request.body);
    const db = getDb();

    // Resolve workspace: admins get the requested dir; all other roles are jailed.
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

    // Start watching for file changes if workspace is set
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

    // Verify session ownership first
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
    // Load workspaceDir before deleting so we can stop its watcher, checking ownership
    const [session] = await db
      .select({ workspaceDir: sessions.workspaceDir })
      .from(sessions)
      .where(and(eq(sessions.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);

    if (!session) return reply.notFound('Session not found');

    await db.delete(sessions).where(eq(sessions.id, request.params.id));

    // Release watcher ref for this session's workspace
    if (session?.workspaceDir) {
      await unwatchWorkspace(session.workspaceDir);
    }

    return { success: true };
  });
};
