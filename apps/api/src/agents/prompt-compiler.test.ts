import { describe, it, expect } from 'vitest';
import { compilePrompt } from './prompt-compiler.js';
import type { ContextItem } from '@arp/shared';

describe('Prompt Compiler', () => {
  it('should trim conversation history according to maxTokens', () => {
    const history = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Message 2' },
    ];
    
    const options = {
      taskDescription: 'Current Task',
      contextItems: [] as ContextItem[],
      conversationHistory: history,
      availableToolNames: ['read_file'],
      provider: 'ollama' as const,
      model: 'qwen2.5-coder:7b',
    };

    const compiled = compilePrompt(options);
    expect(compiled.messages.length).toBeGreaterThan(0);
    // User message (task description) is appended at the end because the last history message was assistant
    expect(compiled.messages[compiled.messages.length - 1].content).toContain('Current Task');
  });

  it('should trim oversized newest history messages', () => {
    const history = [
      { role: 'user', content: 'short message' },
      { role: 'assistant', content: 'a'.repeat(50000) }, // newest message exceeds limit
    ];
    
    const options = {
      taskDescription: 'Local Task',
      contextItems: [] as ContextItem[],
      conversationHistory: history,
      availableToolNames: ['read_file'],
      provider: 'ollama' as const,
      model: 'qwen2.5-coder:7b',
    };

    const compiled = compilePrompt(options);
    
    expect(compiled.messages.some(m => m.content.includes('[history truncated]'))).toBe(true);
  });
});
