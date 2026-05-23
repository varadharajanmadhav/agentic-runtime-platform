import type { FastifyPluginAsync } from 'fastify';
import { CreateTaskSchema } from '@arp/shared';
import { getDb, tasks, agentEvents, toolExecutions, desc, eq, and, messages } from '@arp/db';
import { getTaskQueue } from '../lib/queue.js';
import { emitTaskEvent } from '../lib/events.js';
import { randomUUID } from 'crypto';

export const taskRoutes: FastifyPluginAsync = async (fastify) => {
  // List tasks for a session
  fastify.get<{ Querystring: { sessionId?: string } }>('/', async (request, reply) => {
    const db = getDb();
    let query = db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(50);
    if (request.query.sessionId) {
      query = query.where(eq(tasks.sessionId, request.query.sessionId)) as typeof query;
    }
    const allTasks = await query;
    return { success: true, data: allTasks };
  });

  // Get task by ID
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const [task] = await db.select().from(tasks).where(eq(tasks.id, request.params.id)).limit(1);
    if (!task) return reply.notFound('Task not found');
    return { success: true, data: task };
  });

  // Get task events
  fastify.get<{ Params: { id: string } }>('/:id/events', async (request, reply) => {
    const db = getDb();
    const events = await db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.taskId, request.params.id))
      .orderBy(agentEvents.timestamp);
    return { success: true, data: events };
  });

  // Get task tool executions
  fastify.get<{ Params: { id: string } }>('/:id/tools', async (request, reply) => {
    const db = getDb();
    const executions = await db
      .select()
      .from(toolExecutions)
      .where(eq(toolExecutions.taskId, request.params.id))
      .orderBy(toolExecutions.createdAt);
    return { success: true, data: executions };
  });

  // Create and queue a task
  fastify.post('/', async (request, reply) => {
    const body = CreateTaskSchema.parse(request.body);
    const db = getDb();
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

  // Cancel a task
  fastify.post<{ Params: { id: string } }>('/:id/cancel', async (request, reply) => {
    const db = getDb();
    const [task] = await db
      .update(tasks)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(tasks.id, request.params.id))
      .returning();
    if (!task) return reply.notFound('Task not found');

    emitTaskEvent(task.id, task.sessionId, 'task_failed', { taskId: task.id, error: 'Agent is stopped' });

    return { success: true, data: task };
  });
};
