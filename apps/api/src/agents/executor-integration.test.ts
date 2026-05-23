import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTask } from './executor.js';

// Mock database models and functions
const mockTask = {
  id: 'task-123',
  sessionId: 'session-456',
  title: 'Test Task',
  description: 'Write a hello world script',
  complexity: 'low',
  allowedTools: [],
  workspaceDir: null,
  retryCount: 0,
};

const mockDbUpdate = vi.fn().mockReturnValue({
  where: vi.fn().mockResolvedValue([mockTask]),
});

const mockDb = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockTask]),
        }),
        limit: vi.fn().mockResolvedValue([mockTask]),
      }),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([mockTask]),
    }),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue([]),
  }),
};

// Mock @arp/db
vi.mock('@arp/db', () => ({
  getDb: () => mockDb,
  tasks: { id: 'id', status: 'status', sessionId: 'sessionId' },
  agentEvents: {},
  toolExecutions: {},
  messages: { sessionId: 'sessionId', createdAt: 'createdAt', role: 'role' },
  eq: (a: any, b: any) => ({ col: a, val: b }),
  desc: (a: any) => a,
}));

// Mock @arp/ai
vi.mock('@arp/ai', () => ({
  getModelRouter: () => ({
    getRoute: () => ({ provider: 'ollama', model: 'qwen2.5-coder:7b' }),
    getModel: () => ({}),
  }),
  adaptPrompt: () => ({
    system: 'Adapted System',
    userPrefix: '',
    userSuffix: '',
    toolCallFormat: 'native',
    maxContextTokens: 4000,
  }),
  getModelContextWindow: () => 4000,
  createTokenBudget: () => ({ context: 1000, remaining: 1000 }),
  allocateContextItems: () => ({ included: [], compressionApplied: false }),
}));

// Mock ai SDK
vi.mock('ai', () => {
  return {
    streamText: vi.fn().mockReturnValue({
      textStream: (async function* () {
        yield 'Hello';
        yield ' World';
      })(),
      usage: Promise.resolve({
        promptTokens: 50,
        completionTokens: 20,
      }),
    }),
    tool: vi.fn(),
  };
});

// Mock events lib
vi.mock('../lib/events.js', () => ({
  emitTaskEvent: vi.fn(),
  setTaskStartTime: vi.fn(),
  setTaskStatus: vi.fn(),
  setTaskAgentId: vi.fn(),
}));

describe('Executor Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully run task execution pipeline', async () => {
    await executeTask('task-123');

    // Verify task was fetched
    expect(mockDb.select).toHaveBeenCalled();
    
    // Verify status transitions were logged in the database
    expect(mockDb.update).toHaveBeenCalled();
    
    // Verify system/messages were saved
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
