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
import { AGENT } from '../config/constants.js';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool "${label}" timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// Detect queries that don't need LLM-based planning or vector context retrieval.
// Covers: greetings/small talk, short queries without code intent, and any message
// with attached file context (the file IS the context — no need to vector-search more).
function isConversationalQuery(description: string): boolean {
  // Messages with attached files already carry their own context
  if (/### Attached Files:/i.test(description)) return true;
  const trimmed = description.trim();
  if (trimmed.length > 200) return false;
  const trivialPattern = /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|bye|what|who|where|when|why|how are you|what can you|what do you|tell me about yourself|help me understand|explain to me)/i;
  const codeKeywords = /\b(fix|build|test|run|create|write|implement|refactor|debug|deploy|install|configure|add|remove|delete|update|migrate|generate|analyze|review|check|scan|lint|compile|import|export|class|function|method|file|module|package|api|endpoint|schema|database|query|component|hook|route|controller|service|type|interface|enum)\b/i;
  if (trivialPattern.test(trimmed) && !codeKeywords.test(trimmed)) return true;
  return trimmed.length < 60 && !codeKeywords.test(trimmed);
}

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

    // Generate dynamic execution plan steps (skip for trivial/conversational queries)
    const skipPlanning = isConversationalQuery(description);
    if (!skipPlanning) {
      try {
        // Strip attached file blocks — planning only needs the user's intent, not file contents
        const planDescription = description
          .replace(/\n\n### Attached Files:[\s\S]*/i, '')
          .slice(0, 500)
          .trim();
        const planPrompt = `You are a planning module for an AI coding assistant.
Analyze the following user task and break it down into 3 to 5 logical, high-level steps for an execution checklist.
Provide the output strictly as a JSON array of objects, with no explanation and no markdown block formatting.
Each object must have the following fields:
- "id": a string slug (e.g. "read_code", "write_auth_handler", "run_tests")
- "description": a concise explanation of what the step aims to accomplish (max 80 chars)
- "status": "pending"

Task: "${planDescription}"

JSON Array:`;

        const planRes = await withTimeout(
          generateText({ model, prompt: planPrompt, maxTokens: 500, temperature: 0.1 }),
          30_000,
          'plan_generation',
        );

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

          const result = await withTimeout(
            registry.execute(t.name, input, {
              taskId,
              sessionId,
              workspaceDir: workspaceDir ?? undefined,
              provider: route.provider,
              model: route.model,
            }),
            AGENT.TOOL_TIMEOUT_MS,
            t.name,
          );

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

          let finalOutput = result.output;
          if (typeof finalOutput === 'string') {
            const maxChars = 16000; // ~4000 tokens
            if (finalOutput.length > maxChars) {
              finalOutput = finalOutput.slice(0, maxChars) + '\n\n... [Tool output truncated to save context space]';
            }
          } else if (finalOutput !== null && finalOutput !== undefined) {
            const strOutput = JSON.stringify(finalOutput);
            const maxChars = 16000;
            if (strOutput.length > maxChars) {
              finalOutput = strOutput.slice(0, maxChars) + '\n\n... [Tool output JSON truncated to save context space]';
            }
          }

          return finalOutput;
        },
      }) as any;
    }

    // Context retrieval — skip for conversational queries, cap at 10s for others
    if (workspaceDir && !skipPlanning) {
      try {
        contextItems = await withTimeout(
          retrieveContext({ query: description, workspaceDir }),
          10_000,
          'context_retrieval',
        );
        console.log(`[Executor] Retrieved ${contextItems.length} context items for task.`);
      } catch (ctxErr) {
        console.warn('[Executor] Context retrieval skipped (timed out or errored):', (ctxErr as Error).message);
      }
    }

    // Build conversation history, summarizing old turns if the session is long
    const conversationHistory = await (async () => {
      try {
        const recentMessages = await db
          .select()
          .from(messages)
          .where(eq(messages.sessionId, sessionId))
          .orderBy(desc(messages.createdAt))
          .limit(30);
        const history = recentMessages
          .reverse()
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        // If history is long, summarize the oldest half to save context tokens
        if (history.length > 16 && !skipPlanning) {
          const oldTurns = history.slice(0, Math.floor(history.length / 2));
          const recent = history.slice(Math.floor(history.length / 2));
          try {
            const summaryRes = await withTimeout(
              generateText({
                model,
                prompt: `Summarize the following conversation history in 3-5 sentences, preserving key decisions, file paths, and code context:\n\n${oldTurns.map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n')}`,
                maxTokens: 300,
                temperature: 0,
              }),
              20_000,
              'history_summarization',
            );
            return [
              { role: 'user' as const, content: `[Previous conversation summary]: ${summaryRes.text}` },
              { role: 'assistant' as const, content: 'Understood. Continuing from where we left off.' },
              ...recent,
            ];
          } catch {
            return history.slice(-10);
          }
        }
        return history;
      } catch (histErr) {
        console.warn('[Executor] Could not load conversation history:', histErr);
        return [];
      }
    })();

    const compiled = compilePrompt({
      taskDescription: description,
      contextItems,
      conversationHistory,
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

    // Stall timeout: abort if no token arrives (stuck connection).
    // Resets on every token, so slow-but-streaming models are never killed.
    const streamAbort = new AbortController();
    const STALL_MS = process.env.STREAM_STALL_TIMEOUT_MS 
      ? parseInt(process.env.STREAM_STALL_TIMEOUT_MS, 10) 
      : 600_000; // Default to 10 minutes to allow slow local models/hardware to load and process prompts
    const stallMinutes = Math.round(STALL_MS / 60_000);
    let lastTokenAt = Date.now();
    let stallTimer = setTimeout(() => streamAbort.abort(new Error(`Stream stalled — no token received for ${stallMinutes} minutes`)), STALL_MS);

    const resetStallTimer = () => {
      lastTokenAt = Date.now();
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => streamAbort.abort(new Error(`Stream stalled — no token received for ${stallMinutes} minutes`)), STALL_MS);
    };

    const { textStream, usage } = streamText({
      model,
      system: compiled.system,
      messages: compiled.messages,
      tools: toolsObj,
      maxSteps: AGENT.MAX_STEPS,
      maxTokens: (route as any).maxTokens,
      maxRetries: 0,
      abortSignal: streamAbort.signal,
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
          resetStallTimer();
          emitTaskEvent(taskId, sessionId, 'token_chunk', { text: chunk.textDelta });
        }
      },
    });

    // Drain stream — check cancellation every 2s, not every token
    let lastCancelCheck = Date.now();
    try {
      for await (const _ of textStream) {
        const now = Date.now();
        if (now - lastCancelCheck >= 2000) {
          lastCancelCheck = now;
          const [currentTask] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
          if (currentTask?.status === 'cancelled') {
            throw new Error('Task was cancelled by user');
          }
        }
      }
    } finally {
      clearTimeout(stallTimer);
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
