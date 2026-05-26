import { describe, it, expect } from 'vitest';
import { capOutput } from './utils.js';
import type { ToolContext } from './registry.js';

describe('capOutput', () => {
  it('should return original text when it is shorter than the limit', () => {
    const context: ToolContext = { taskId: '1', sessionId: '1', provider: 'ollama' };
    const text = 'Hello, world!';
    expect(capOutput(text, context, 50)).toBe(text);
  });

  it('should truncate to defaultMax and append message when output exceeds defaultMax', () => {
    const context: ToolContext = { taskId: '1', sessionId: '1', provider: 'ollama' };
    const text = 'a'.repeat(100);
    const result = capOutput(text, context, 50);
    expect(result).toContain('... [output truncated to 50 characters to fit context/rate limits]');
    expect(result.startsWith('a'.repeat(50))).toBe(true);
  });

});
