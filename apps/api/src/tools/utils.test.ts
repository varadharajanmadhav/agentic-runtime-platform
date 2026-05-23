import { describe, it, expect } from 'vitest';
import { capOutput } from './utils.js';
import type { ToolContext } from './registry.js';

describe('capOutput', () => {
  it('should return original text when it is shorter than the limit', () => {
    const context: ToolContext = { taskId: '1', sessionId: '1', provider: 'openai' };
    const text = 'Hello, world!';
    expect(capOutput(text, context, 50)).toBe(text);
  });

  it('should truncate to defaultMax and append message when provider is not groq and exceeds defaultMax', () => {
    const context: ToolContext = { taskId: '1', sessionId: '1', provider: 'openai' };
    const text = 'a'.repeat(100);
    const result = capOutput(text, context, 50);
    expect(result).toContain('... [output truncated to 50 characters to fit context/rate limits]');
    expect(result.startsWith('a'.repeat(50))).toBe(true);
  });

  it('should truncate to 8000 when provider is groq and exceeds 8000, ignoring defaultMax if it is higher', () => {
    const context: ToolContext = { taskId: '1', sessionId: '1', provider: 'groq' };
    const text = 'a'.repeat(9000);
    const result = capOutput(text, context, 100000);
    expect(result).toContain('... [output truncated to 8000 characters to fit context/rate limits]');
    expect(result.startsWith('a'.repeat(8000))).toBe(true);
  });

  it('should return original text for groq if it is under 8000', () => {
    const context: ToolContext = { taskId: '1', sessionId: '1', provider: 'groq' };
    const text = 'a'.repeat(5000);
    expect(capOutput(text, context, 100000)).toBe(text);
  });
});
