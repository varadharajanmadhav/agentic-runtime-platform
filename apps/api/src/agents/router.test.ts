import { describe, it, expect } from 'vitest';
import { getModelRouter, ModelRouter } from '@arp/ai';

describe('ModelRouter', () => {
  it('should initialize and load router singleton', () => {
    const router = getModelRouter();
    expect(router).toBeDefined();
    expect(router.getAvailableProviders()).toEqual(['ollama']);
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

  it('should resolve native Ollama language model instance', () => {
    const router = new ModelRouter({ ollamaBaseUrl: 'http://localhost:11434/api' });
    const modelInstance = router.getModelByProvider('ollama', 'qwen2.5-coder:7b');
    expect(modelInstance).toBeDefined();
    expect(modelInstance.modelId).toBe('qwen2.5-coder:7b');
    expect(modelInstance.provider).toBe('ollama.chat');
  });

  it('should resolve local OpenAI-compatible endpoints through Ollama provider routing', () => {
    const router = new ModelRouter({ ollamaBaseUrl: 'http://localhost:1234/v1' });
    const modelInstance = router.getModelByProvider('ollama', 'local-model');

    expect(modelInstance).toBeDefined();
    expect(modelInstance.modelId).toBe('local-model');
    expect(modelInstance.provider).toBe('openai.chat');
  });

  it('should throw an error for unsupported model providers', () => {
    const router = getModelRouter();
    expect(() => {
      (router as any).resolveLanguageModel('invalid_provider', 'model');
    }).toThrow('Unsupported model provider: invalid_provider');
  });

  it('should support disableThinking routing configuration and getter', () => {
    const router = new ModelRouter({}, { disableThinking: true });
    expect(router.getDisableThinkingConstraint()).toBe(true);

    const routerFalse = new ModelRouter({}, { disableThinking: false });
    expect(routerFalse.getDisableThinkingConstraint()).toBe(false);
  });
});
