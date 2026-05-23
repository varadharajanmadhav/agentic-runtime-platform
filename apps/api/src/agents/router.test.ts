import { describe, it, expect } from 'vitest';
import { getModelRouter, ModelRouter } from '@arp/ai';

describe('ModelRouter', () => {
  it('should initialize and load router singleton', () => {
    const router = getModelRouter();
    expect(router).toBeDefined();
    expect(router.getAvailableProviders()).toEqual(['ollama', 'openai', 'anthropic', 'google', 'groq']);
  });

  it('should resolve routing configurations for different complexities', () => {
    const router = getModelRouter();
    
    const lowRoute = router.getRoute('low');
    expect(lowRoute).toBeDefined();
    expect(lowRoute.provider).toBeDefined();
    expect(lowRoute.model).toBeDefined();

    const mediumRoute = router.getRoute('medium');
    expect(mediumRoute).toBeDefined();

    const highRoute = router.getRoute('high');
    expect(highRoute).toBeDefined();
  });

  it('should resolve language model instance from provider and model name', () => {
    const router = getModelRouter();
    // Resolve dummy OpenAI model instance
    const modelInstance = router.getModelByProvider('openai', 'gpt-4o');
    expect(modelInstance).toBeDefined();
    expect(modelInstance.modelId).toBe('gpt-4o');
    expect(modelInstance.provider).toBe('openai.chat');
  });

  it('should throw an error for unsupported model providers', () => {
    const router = getModelRouter();
    expect(() => {
      (router as any).resolveLanguageModel('invalid_provider', 'model');
    }).toThrow('Unsupported model provider: invalid_provider');
  });
});
