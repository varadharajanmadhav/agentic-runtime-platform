import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

let emitter: EventEmitter | null = null;

const taskStartTimes = new Map<string, number>();
const taskStatuses = new Map<string, string>();
const taskAgentIds = new Map<string, string>();

export function setTaskStartTime(taskId: string, time: number) {
  taskStartTimes.set(taskId, time);
}

export function setTaskStatus(taskId: string, status: string) {
  taskStatuses.set(taskId, status);
}

export function setTaskAgentId(taskId: string, agentId: string) {
  taskAgentIds.set(taskId, agentId);
}

export function createStructuredPayload(
  taskId: string,
  sessionId: string,
  eventType: string,
  customPayload: Record<string, unknown>
): Record<string, unknown> {
  const startTime = taskStartTimes.get(taskId);
  const duration = startTime ? Date.now() - startTime : 0;
  const status = taskStatuses.get(taskId) || 'queued';
  const agentId = taskAgentIds.get(taskId) || 'agent-executor';
  const eventId = randomUUID();
  const timestamp = new Date().toISOString();

  return {
    eventId,
    timestamp,
    agentId,
    sessionId,
    taskId,
    eventType,
    status,
    duration,
    metadata: customPayload,
    ...customPayload // Merge original payload at top-level for backward-compatibility
  };
}

export function getEventEmitter(): EventEmitter {
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(1000); // Many SSE clients
  }
  return emitter;
}

export function emitTaskEvent(
  taskId: string,
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  const em = getEventEmitter();
  const structuredPayload = createStructuredPayload(taskId, sessionId, type, payload);
  const event = { type, payload: structuredPayload, taskId, sessionId, timestamp: structuredPayload.timestamp };
  em.emit(`task:${taskId}`, event);
  em.emit(`session:${sessionId}`, event);
}

