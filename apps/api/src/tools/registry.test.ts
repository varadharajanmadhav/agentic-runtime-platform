import { describe, it, expect } from 'vitest';
import { getToolRegistry, type ToolDefinition } from './registry.js';
import { z } from 'zod';

describe('ToolRegistry', () => {
  const registry = getToolRegistry();

  it('should list all registered built-in tools', () => {
    const tools = registry.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.name === 'read_file')).toBe(true);
  });

  it('should retrieve a registered tool by name', () => {
    const tool = registry.get('read_file');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('read_file');
  });

  it('should fail to execute an unknown tool', async () => {
    const result = await registry.execute('non_existent_tool', {}, { taskId: '1', sessionId: '1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('should validate tool inputs against schema and run the tool successfully', async () => {
    // Register a test tool
    const testToolSchema = z.object({
      msg: z.string().min(3),
    });

    const testTool: ToolDefinition = {
      name: 'test_custom_tool',
      description: 'A test custom tool',
      inputSchema: testToolSchema,
      async execute(input) {
        const { msg } = input as { msg: string };
        return {
          success: true,
          output: `Echo: ${msg}`,
          durationMs: 0,
        };
      },
    };

    registry.register(testTool);

    // Test valid execution
    const validResult = await registry.execute('test_custom_tool', { msg: 'Hello' }, { taskId: '1', sessionId: '1' });
    expect(validResult.success).toBe(true);
    expect(validResult.output).toBe('Echo: Hello');

    // Test invalid execution (msg too short)
    const invalidResult = await registry.execute('test_custom_tool', { msg: 'Hi' }, { taskId: '1', sessionId: '1' });
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.error).toContain('Invalid input for tool');
  });
});
