import type { FastifyPluginAsync } from 'fastify';
import { CreateTaskSchema } from '@arp/shared';
import { getDb, tasks, agentEvents, toolExecutions, desc, eq, and, messages, sessions } from '@arp/db';
import { getTaskQueue } from '../lib/queue.js';
import { emitTaskEvent } from '../lib/events.js';
import { randomUUID } from 'crypto';

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // List tasks for a session (scoped to authenticated user)
  fastify.get<{ Querystring: { sessionId?: string } }>('/', async (request, reply) => {
    const db = getDb();
    const sessionId = request.query.sessionId;

    if (sessionId) {
      const [session] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, request.user.userId)))
        .limit(1);
      if (!session) return reply.notFound('Session not found');

      const allTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.sessionId, sessionId))
        .orderBy(desc(tasks.createdAt))
        .limit(50);
      return { success: true, data: allTasks };
    } else {
      const allTasksWithSession = await db
        .select({
          id: tasks.id,
          sessionId: tasks.sessionId,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          complexity: tasks.complexity,
          workspaceDir: tasks.workspaceDir,
          allowedTools: tasks.allowedTools,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .innerJoin(sessions, eq(tasks.sessionId, sessions.id))
        .where(eq(sessions.userId, request.user.userId))
        .orderBy(desc(tasks.createdAt))
        .limit(50);
      return { success: true, data: allTasksWithSession };
    }
  });

  // Get task by ID (scoped to authenticated user)
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [task] = await db
      .select({
        id: tasks.id,
        sessionId: tasks.sessionId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        complexity: tasks.complexity,
        workspaceDir: tasks.workspaceDir,
        allowedTools: tasks.allowedTools,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .innerJoin(sessions, eq(tasks.sessionId, sessions.id))
      .where(and(eq(tasks.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);
    if (!task) return reply.notFound('Task not found');
    return { success: true, data: task };
  });

  // Get task events (scoped to authenticated user)
  fastify.get<{ Params: { id: string } }>('/:id/events', async (request, reply) => {
    const db = getDb();
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(sessions, eq(tasks.sessionId, sessions.id))
      .where(and(eq(tasks.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);
    if (!task) return reply.notFound('Task not found');

    const events = await db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.taskId, request.params.id))
      .orderBy(agentEvents.timestamp);
    return { success: true, data: events };
  });

  // Get task tool executions (scoped to authenticated user)
  fastify.get<{ Params: { id: string } }>('/:id/tools', async (request, reply) => {
    const db = getDb();
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(sessions, eq(tasks.sessionId, sessions.id))
      .where(and(eq(tasks.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);
    if (!task) return reply.notFound('Task not found');

    const executions = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.taskId, request.params.id))
      .orderBy(toolExecutions.createdAt);
    return { success: true, data: executions };
  });

  // Create and queue a task (scoped to authenticated user)
  fastify.post('/', async (request, reply) => {
    const body = CreateTaskSchema.parse(request.body);
    const db = getDb();

    // Verify session belongs to requesting user
    const [session] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, body.sessionId), eq(sessions.userId, request.user.userId)))
      .limit(1);
    if (!session) return reply.notFound('Session not found');

    const taskId = randomUUID();

    const [task] = await db
      .insert(tasks)
      .values({
        id: taskId,
        sessionId: body.sessionId,
        title: body.title,
        description: body.description,
        complexity: body.complexity,
        workspaceDir: body.workspaceDir,
        allowedTools: body.allowedTools ?? [],
        status: 'queued',
      })
      .returning();

    // Insert user message to make it persistent in chat history
    await db.insert(messages).values({
      id: randomUUID(),
      sessionId: body.sessionId,
      role: 'user',
      content: body.description,
    });

    // Queue for execution
    const queue = getTaskQueue();
    await queue.add('execute-task', { taskId }, {
      jobId: taskId,
      attempts: 1,
      backoff: { type: 'exponential', delay: 2000 },
    });

    return reply.status(201).send({ success: true, data: task });
  });

  // Cancel a task (scoped to authenticated user)
  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (request, reply) => {
    const db = getDb();
    const [taskCheck] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(sessions, eq(tasks.sessionId, sessions.id))
      .where(and(eq(tasks.id, request.params.id), eq(sessions.userId, request.user.userId)))
      .limit(1);
    if (!taskCheck) return reply.notFound('Task not found');

    const [task] = await db
      .update(tasks)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(tasks.id, request.params.id))
      .returning();

    emitTaskEvent(task.id, task.sessionId, 'task_failed', { taskId: task.id, error: 'Agent is stopped' });

    return { success: true, data: task };
  });
};
