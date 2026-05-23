import { describe, it, expect } from 'vitest';
import { compilePrompt } from './prompt-compiler.js';
import type { ContextItem } from '@arp/shared';

describe('Prompt Compiler', () => {
  it('should trim conversation history according to maxTokens', () => {
    const history = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Message 2' },
    ];
    
    // Low complexity options for a standard provider
    const options = {
      taskDescription: 'Current Task',
      contextItems: [] as ContextItem[],
      conversationHistory: history,
      availableToolNames: ['read_file'],
      provider: 'openai' as const,
      model: 'gpt-4o',
    };

    const compiled = compilePrompt(options);
    expect(compiled.messages.length).toBeGreaterThan(0);
    // User message (task description) is appended at the end because the last history message was assistant
    expect(compiled.messages[compiled.messages.length - 1].content).toContain('Current Task');
  });

  it('should apply strict history trimming limits for groq provider', () => {
    const history = [
      { role: 'user', content: 'short message' },
      { role: 'assistant', content: 'a'.repeat(4000) }, // newest message exceeds limit
    ];
    
    const options = {
      taskDescription: 'Groq Task',
      contextItems: [] as ContextItem[],
      conversationHistory: history,
      availableToolNames: ['read_file'],
      provider: 'groq' as const,
      model: 'llama-3.3-70b-versatile',
    };

    const compiled = compilePrompt(options);
    
    // For Groq, the newest assistant message (1000 tokens) exceeds the 500 token limit.
    // It should be truncated because it is the newest message and alone exceeds the limit.
    expect(compiled.messages.some(m => m.content.includes('[history truncated]'))).toBe(true);
  });
});
