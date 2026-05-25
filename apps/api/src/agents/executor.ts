import { streamText, tool } from 'ai';
import { z } from 'zod';
import { getDb, tasks, agentEvents, toolExecutions, messages, eq, desc } from '@arp/db';
import { getModelRouter } from '@arp/ai';
import { emitTaskEvent, setTaskStartTime, setTaskStatus, setTaskAgentId } from '../lib/events.js';
import { getToolRegistry } from '../tools/registry.js';
import { compilePrompt } from './prompt-compiler.js';
import { retrieveContext } from './context/retriever.js';
import type { ContextItem } from '@arp/shared';
import { estimateCostUsd, estimateTokenCount } from '@arp/shared';
import { randomUUID } from 'crypto';

export async function executeTask(taskId: string): Promise<void> {
  const db = getDb();

  // Load task
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const { sessionId } = task;
  let fullText = '';
  let contextItems: ContextItem[] = [];

  // Phase tracking setup
  const agentId = `agent-${randomUUID().slice(0, 8)}`;
  setTaskAgentId(taskId, agentId);
  setTaskStartTime(taskId, Date.now());
  setTaskStatus(taskId, 'queued');

  try {
    const { description, complexity, workspaceDir, allowedTools } = task;

    // Update status → planning
    setTaskStatus(taskId, 'planning');
    await db.update(tasks).set({ status: 'planning', startedAt: new Date() }).where(eq(tasks.id, taskId));
    await saveEvent(taskId, sessionId, 'task_started', { taskId, title: task.title });
    emitTaskEvent(taskId, sessionId, 'task_started', { taskId, title: task.title });

    const router = getModelRouter();
    const route = router.getRoute(complexity as 'low' | 'medium' | 'high');
    const model = router.getModel(complexity as 'low' | 'medium' | 'high');
    const registry = getToolRegistry();

    // Build Vercel AI SDK tools from registry
    const toolsObj: Record<string, any> = {};
    const toolList = registry.listTools().filter(t =>
      !allowedTools || (allowedTools as string[]).length === 0 || (allowedTools as string[]).includes(t.name)
    );

    for (const t of toolList) {
      toolsObj[t.name] = tool({
        description: t.description,
        parameters: t.inputSchema as any,
        execute: async (input: any) => {
          const [currentTask] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
          if (currentTask?.status === 'cancelled') {
            throw new Error('Task was cancelled by user');
          }
          const start = Date.now();
          emitTaskEvent(taskId, sessionId, 'tool_called', { toolName: t.name, input });
          await saveEvent(taskId, sessionId, 'tool_called', { toolName: t.name, input });

          const result = await registry.execute(t.name, input, {
            taskId,
            sessionId,
            workspaceDir: workspaceDir ?? undefined,
            provider: route.provider,
            model: route.model,
          });

          const durationMs = Date.now() - start;

          // Log tool execution
          await db.insert(toolExecutions).values({
            id: randomUUID(),
            taskId,
            sessionId,
            toolName: t.name,
            input: input as Record<string, unknown>,
            output: result.output as Record<string, unknown>,
            error: result.error,
            durationMs,
            success: result.success,
            sandboxed: false,
          });

          emitTaskEvent(taskId, sessionId, 'tool_result', {
            toolName: t.name,
            success: result.success,
            durationMs,
            output: result.output,
          });
          await saveEvent(taskId, sessionId, 'tool_result', { toolName: t.name, success: result.success, durationMs });

          return result.output;
        },
      }) as any;
    }

    // Compile prompt with context retrieval
    if (workspaceDir) {
      try {
        contextItems = await retrieveContext({
          query: description,
          workspaceDir,
        });
        console.log(`[Executor] Retrieved ${contextItems.length} context items for task.`);
      } catch (ctxErr) {
        console.error('[Executor] Error retrieving context:', ctxErr);
      }
    }

    const compiled = compilePrompt({
      taskDescription: description,
      contextItems,
      // M-13: Load recent conversation history so the agent has context of prior turns
      conversationHistory: await (async () => {
        try {
          const recentMessages = await db
            .select()
            .from(messages)
            .where(eq(messages.sessionId, sessionId))
            .orderBy(desc(messages.createdAt))
            .limit(10);
          return recentMessages
            .reverse()
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        } catch (histErr) {
          console.warn('[Executor] Could not load conversation history:', histErr);
          return [];
        }
      })(),
      availableToolNames: toolList.map(t => t.name),
      provider: route.provider,
      model: route.model,
      workspaceDir: workspaceDir ?? undefined,
    });

    // Save and emit context_assembled event
    const assembledPayload = {
      systemPrompt: compiled.system,
      totalTokens: compiled.totalTokens,
      compressionApplied: compiled.compressionApplied,
      items: contextItems.map(item => ({
        id: item.id,
        type: item.type,
        path: item.path,
        content: item.content,
        relevanceScore: item.relevanceScore,
        tokenCount: item.tokenCount,
        included: compiled.context.some(c => c.id === item.id),
      }))
    };
    await saveEvent(taskId, sessionId, 'context_assembled', assembledPayload);
    emitTaskEvent(taskId, sessionId, 'context_assembled', assembledPayload);

    setTaskStatus(taskId, 'executing');
    await db.update(tasks).set({ status: 'executing' }).where(eq(tasks.id, taskId));

    let promptTokens = 0;
    let completionTokens = 0;

    let streamError: Error | null = null;

    const { textStream, usage } = streamText({
      model,
      system: compiled.system,
      messages: compiled.messages,
      tools: toolsObj,
      maxSteps: 20,
      maxTokens: (route as any).maxTokens ?? (route.provider === 'groq' ? 1024 : undefined),
      maxRetries: 0,
      onError: ({ error }) => {
        streamError = error instanceof Error ? error : new Error(
          typeof error === 'object' && error !== null
            ? (error as any).message || (error as any).statusText || JSON.stringify(error)
            : String(error),
        );
      },
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          fullText += chunk.textDelta;
          emitTaskEvent(taskId, sessionId, 'token_chunk', { text: chunk.textDelta });
        }
      },
    });

    // Drain stream
    for await (const _ of textStream) {
      const [currentTask] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (currentTask?.status === 'cancelled') {
        throw new Error('Task was cancelled by user');
      }
    }

    if (streamError) {
      throw streamError;
    }

    const resolvedUsage = await usage;
    promptTokens = (resolvedUsage && Number.isInteger(resolvedUsage.promptTokens)) ? resolvedUsage.promptTokens : 0;
    completionTokens = (resolvedUsage && Number.isInteger(resolvedUsage.completionTokens)) ? resolvedUsage.completionTokens : 0;

    // Fallback estimation if the AI provider does not report token counts (e.g. local models via Ollama)
    if (promptTokens === 0) {
      promptTokens = compiled.totalTokens || estimateTokenCount(compiled.system + '\n' + compiled.messages.map(m => m.content).join('\n'));
    }
    if (completionTokens === 0) {
      completionTokens = estimateTokenCount(fullText);
    }

    const totalTokens = promptTokens + completionTokens;
    const rawCost = estimateCostUsd(promptTokens, completionTokens, route.provider, route.model);
    const cost = Number.isNaN(rawCost) ? 0 : rawCost;

    // Save assistant message
    await db.insert(messages).values({
      id: randomUUID(),
      sessionId,
      role: 'assistant',
      content: fullText,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: cost,
      provider: route.provider,
      model: route.model,
    });

    // Update task → completed
    await db.update(tasks).set({
      status: 'completed',
      completedAt: new Date(),
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: cost,
      result: {
        success: true,
        output: fullText,
        retryCount: task.retryCount,
        contextItems: contextItems.map(item => ({
          id: item.id,
          type: item.type,
          path: item.path,
          relevanceScore: item.relevanceScore,
          tokenCount: item.tokenCount,
          metadata: item.metadata
        }))
      },
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));

    setTaskStatus(taskId, 'completed');
    await saveEvent(taskId, sessionId, 'task_completed', { taskId, totalTokens, cost, promptTokens, completionTokens, output: fullText });
    emitTaskEvent(taskId, sessionId, 'task_completed', { taskId, totalTokens, cost, promptTokens, completionTokens, output: fullText });

  } catch (err) {
    console.error('[Executor] Task failed with error:', err);
    let errorMsg = 'Unknown error';
    if (err instanceof Error) {
      errorMsg = err.stack || err.message;
    } else if (err && typeof err === 'object') {
      try {
        errorMsg = JSON.stringify(err);
      } catch {
        errorMsg = String(err);
      }
    } else {
      errorMsg = String(err);
    }
    const [currentTask] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
    // M-3: Use only DB status for cancellation detection, not fragile string matching
    const isCancelled = currentTask?.status === 'cancelled';

    await db.update(tasks).set({
      status: isCancelled ? 'cancelled' : 'failed',
      completedAt: new Date(),
      result: {
        success: false,
        output: fullText,
        failureReason: errorMsg,
        retryCount: task.retryCount,
        contextItems: contextItems.map(item => ({
          id: item.id,
          type: item.type,
          path: item.path,
          relevanceScore: item.relevanceScore,
          tokenCount: item.tokenCount,
          metadata: item.metadata
        }))
      },
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));

    // Save error/cancellation message in DB to persist in chatbox
    await db.insert(messages).values({
      id: randomUUID(),
      sessionId,
      role: 'assistant',
      content: isCancelled 
        ? `Agent is stopped`
        : `❌ **Error: Task Execution Failed**\n\n\`\`\`\n${errorMsg}\n\`\`\``,
    }).catch(dbErr => console.error('[Executor] Failed to save error message to db:', dbErr));

    if (isCancelled) {
      setTaskStatus(taskId, 'cancelled');
      await saveEvent(taskId, sessionId, 'task_failed', { taskId, error: 'Agent is stopped' });
      emitTaskEvent(taskId, sessionId, 'task_failed', { taskId, error: 'Agent is stopped' });
      return;
    }

    setTaskStatus(taskId, 'failed');
    await saveEvent(taskId, sessionId, 'task_failed', { taskId, error: errorMsg });
    emitTaskEvent(taskId, sessionId, 'task_failed', { taskId, error: errorMsg });
    throw err;
  }
}

async function saveEvent(
  taskId: string,
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.insert(agentEvents).values({
    id: randomUUID(),
    taskId,
    sessionId,
    type: type as never,
    payload,
  });
}

