import { describe, it, expect } from 'vitest';
import { compilePrompt } from './prompt-compiler.js';
import type { ContextItem } from '@arp/shared';
import { initModelRouter } from '@arp/ai';

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

  it('should support disableThinking routing configuration and suppress thinking blocks', () => {
    initModelRouter(undefined, { disableThinking: true });
    
    const options = {
      taskDescription: 'Testing task',
      contextItems: [] as ContextItem[],
      conversationHistory: [],
      availableToolNames: ['read_file'],
      provider: 'ollama' as const,
      model: 'qwen3-4b-gguf:q4_k_m',
    };

    const compiled = compilePrompt(options);
    const systemPrompt = compiled.system;
    
    // The compiled system prompt should contain the direct answer instructions and lacks step-by-step reasoning instructions
    expect(systemPrompt).toContain('IMPORTANT: Do NOT include any reasoning, explanation, step-by-step thinking, or <think> tags.');
    expect(systemPrompt).not.toContain('Think step by step before acting.');
    
    // Reset router
    initModelRouter(undefined, { disableThinking: false });
    const compiledNormal = compilePrompt(options);
    const systemPromptNormal = compiledNormal.system;
    expect(systemPromptNormal).not.toContain('IMPORTANT: Do NOT include any reasoning, explanation, step-by-step thinking, or <think> tags.');
    expect(systemPromptNormal).toContain('Think step by step before acting.');
  });
});
