import { streamText, tool, generateText } from 'ai';
import { z } from 'zod';
import { getDb, tasks, agentEvents, toolExecutions, messages, eq, desc } from '@arp/db';
import { getModelRouter } from '@arp/ai';
import { emitTaskEvent, setTaskStartTime, setTaskStatus, setTaskAgentId } from '../lib/events.js';
import { getToolRegistry } from '../tools/registry.js';
import { compilePrompt } from './prompt-compiler.js';
import { retrieveContext } from './context/retriever.js';
import type { ContextItem, PlanStep } from '@arp/shared';
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
  let steps: PlanStep[] = [];

  // Phase tracking setup
  const agentId = `agent-${randomUUID().slice(0, 8)}`;
  setTaskAgentId(taskId, agentId);
  setTaskStartTime(taskId, Date.now());
  setTaskStatus(taskId, 'queued');

  async function updateStepStatus(stepId: string, status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped') {
    steps = steps.map(s => s.id === stepId ? { ...s, status } : s);
    await db.update(tasks).set({
      plan: { steps, totalEstimatedTokens: 0 },
      updatedAt: new Date()
    }).where(eq(tasks.id, taskId));

    if (status === 'running') {
      await saveEvent(taskId, sessionId, 'step_started', { taskId, stepId });
      emitTaskEvent(taskId, sessionId, 'step_started', { taskId, stepId });
    } else if (status === 'completed') {
      await saveEvent(taskId, sessionId, 'step_completed', { taskId, stepId });
      emitTaskEvent(taskId, sessionId, 'step_completed', { taskId, stepId });
    } else if (status === 'failed') {
      await saveEvent(taskId, sessionId, 'step_failed', { taskId, stepId });
      emitTaskEvent(taskId, sessionId, 'step_failed', { taskId, stepId });
    }
  }

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

    // Generate dynamic execution plan steps
    try {
      const planPrompt = `You are a planning module for an AI coding assistant.
Analyze the following user task and break it down into 3 to 5 logical, high-level steps for an execution checklist.
Provide the output strictly as a JSON array of objects, with no explanation and no markdown block formatting.
Each object must have the following fields:
- "id": a string slug (e.g. "read_code", "write_auth_handler", "run_tests")
- "description": a concise explanation of what the step aims to accomplish (max 80 chars)
- "status": "pending"

Task: "${description}"

JSON Array:`;

      const planRes = await generateText({
        model,
        prompt: planPrompt,
        maxTokens: 500,
        temperature: 0.1,
      });

      const cleanText = planRes.text.trim().replace(/^```json\s*|```$/g, '');
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed) && parsed.length > 0) {
        steps = parsed.map((item, idx) => ({
          id: String(item.id || `step-${idx}`),
          description: String(item.description || 'Executing step'),
          status: idx === 0 ? 'running' : 'pending',
        }));
      }
    } catch (err) {
      console.warn('[Executor] Plan generation failed or timed out. Falling back to default checklist.', err);
    }

    if (steps.length === 0) {
      steps = [
        { id: 'analysis', description: 'Analyze requirements and workspace files', status: 'running' },
        { id: 'implementation', description: 'Modify source code and implement files', status: 'pending' },
        { id: 'validation', description: 'Run build and verify with test scripts', status: 'pending' },
        { id: 'completion', description: 'Finalize changes and present solution', status: 'pending' }
      ];
    }

    // Save plan to database
    await db.update(tasks).set({
      plan: { steps, totalEstimatedTokens: 0 },
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));

    // Emit plan_created event
    await saveEvent(taskId, sessionId, 'plan_created', { taskId, steps });
    emitTaskEvent(taskId, sessionId, 'plan_created', { taskId, steps });
    // Emit step_started for first step
    await saveEvent(taskId, sessionId, 'step_started', { taskId, stepId: steps[0].id });
    emitTaskEvent(taskId, sessionId, 'step_started', { taskId, stepId: steps[0].id });

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

          // If we run a test or diagnostic, check if we should transition steps
          if (['run_terminal', 'run_command', 'dotnet_build', 'dotnet_test', 'npm_run', 'get_diagnostics'].includes(t.name)) {
            const valStep = steps.find(s => s.status === 'pending' && (
              s.id.includes('val') || s.id.includes('test') || s.id.includes('verify') || s.id.includes('check') || s.id.includes('build') ||
              s.description.toLowerCase().includes('val') || s.description.toLowerCase().includes('test') || s.description.toLowerCase().includes('verify') || s.description.toLowerCase().includes('check') || s.description.toLowerCase().includes('build')
            ));
            if (valStep) {
              const currentRunning = steps.find(s => s.status === 'running');
              if (currentRunning && currentRunning.id !== valStep.id) {
                await updateStepStatus(currentRunning.id, 'completed');
              }
              await updateStepStatus(valStep.id, 'running');
            }
          }

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

    if (steps.length > 1) {
      await updateStepStatus(steps[0].id, 'completed');
      await updateStepStatus(steps[1].id, 'running');
    }

    let promptTokens = 0;
    let completionTokens = 0;

    let streamError: Error | null = null;

    const { textStream, usage } = streamText({
      model,
      system: compiled.system,
      messages: compiled.messages,
      tools: toolsObj,
      maxSteps: 20,
      maxTokens: (route as any).maxTokens,
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

    for (const s of steps) {
      if (s.status === 'running' || s.status === 'pending') {
        await updateStepStatus(s.id, 'completed');
      }
    }

    setTaskStatus(taskId, 'completed');
    await saveEvent(taskId, sessionId, 'task_completed', { taskId, totalTokens, cost, promptTokens, completionTokens, output: fullText });
    emitTaskEvent(taskId, sessionId, 'task_completed', { taskId, totalTokens, cost, promptTokens, completionTokens, output: fullText });

  } catch (err) {
    console.error('[Executor] Task failed with error:', err);
    for (const s of steps) {
      if (s.status === 'running') {
        await updateStepStatus(s.id, 'failed');
      } else if (s.status === 'pending') {
        await updateStepStatus(s.id, 'skipped');
      }
    }
    const errorMsg = formatTaskError(err);
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

export function formatTaskError(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();

  function appendError(error: unknown, prefix = '') {
    if (error === null || error === undefined) {
      parts.push(`${prefix}Unknown error`);
      return;
    }

    if (seen.has(error)) return;
    seen.add(error);

    if (typeof error === 'string') {
      parts.push(`${prefix}${error}`);
      return;
    }

    if (typeof error !== 'object') {
      parts.push(`${prefix}${String(error)}`);
      return;
    }

    const record = error as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : undefined;
    const message = typeof record.message === 'string' ? record.message : undefined;
    const statusCode = typeof record.statusCode === 'number' ? record.statusCode : undefined;
    const url = typeof record.url === 'string' ? record.url : undefined;
    const responseBody = typeof record.responseBody === 'string' ? record.responseBody : undefined;
    const data = record.data;

    if (name || message) {
      parts.push(`${prefix}${[name, message].filter(Boolean).join(': ')}`);
    }

    if (statusCode !== undefined) {
      parts.push(`${prefix}HTTP status: ${statusCode}`);
    }

    if (url) {
      parts.push(`${prefix}URL: ${url}`);
    }

    const providerDetail = formatProviderDetail(responseBody, data);
    if (providerDetail) {
      parts.push(`${prefix}Provider response: ${providerDetail}`);
    }

    if (record.cause) {
      appendError(record.cause, `${prefix}Cause: `);
    }

    if (parts.length === 0) {
      try {
        parts.push(`${prefix}${JSON.stringify(error, null, 2)}`);
      } catch {
        parts.push(`${prefix}${String(error)}`);
      }
    }
  }

  appendError(err);
  return parts.join('\n');
}

function formatProviderDetail(responseBody?: string, data?: unknown): string {
  if (data !== undefined) {
    const formattedData = formatUnknownDetail(data);
    if (formattedData) return formattedData;
  }

  if (!responseBody) return '';

  try {
    return formatUnknownDetail(JSON.parse(responseBody)) || responseBody;
  } catch {
    return responseBody;
  }
}

function formatUnknownDetail(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);

  const record = value as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;
    const message = typeof errorRecord.message === 'string' ? errorRecord.message : undefined;
    const code = typeof errorRecord.code === 'string' || typeof errorRecord.code === 'number'
      ? String(errorRecord.code)
      : undefined;
    if (message && code) return `${message} (${code})`;
    if (message) return message;
  }

  const message = typeof record.message === 'string' ? record.message : undefined;
  if (message) return message;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
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
