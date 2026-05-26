import type { ModelProvider } from '@arp/shared';

export interface PromptAdapterOptions {
  provider: ModelProvider;
  model: string;
  systemPrompt: string;
  taskDescription: string;
  includeChainOfThought?: boolean;
}

export interface AdaptedPrompt {
  system: string;
  userPrefix: string;
  userSuffix: string;
  toolCallFormat: 'native' | 'xml' | 'json';
  maxContextTokens: number;
}

/**
 * Adapts prompts to work well across different model families.
 * Open models (Ollama) need different prompting than Claude/GPT.
 */
export function adaptPrompt(options: PromptAdapterOptions): AdaptedPrompt {
  const { model } = options;

  // Ollama — open models need more explicit instruction
  return buildOllamaPrompt(options, model);
}

function buildOllamaPrompt(options: PromptAdapterOptions, model: string): AdaptedPrompt {
  const isSmallModel = model.includes('7b') || model.includes('8b') || model.includes('3b');
  const maxContextTokens = isSmallModel ? 8000 : 32000;

  let system = options.systemPrompt;

  // Small models benefit from explicit chain-of-thought instructions
  if (isSmallModel || options.includeChainOfThought) {
    system += `\n\n## Instructions\nThink step by step before acting. When you need to use a tool, explain briefly what you will do and why before calling it.`;
  }

  // Explicit JSON schema reminder for models with weaker function-calling
  system += `\n\nIMPORTANT: Always use the provided tools when you need to read files, run commands, or search code. Never make up file contents or command output.`;

  return {
    system,
    userPrefix: '',
    userSuffix: isSmallModel ? '\n\nRemember to think step by step and use tools when needed.' : '',
    toolCallFormat: 'native',
    maxContextTokens,
  };
}

// Model context window sizes for token budgeting
export function getModelContextWindow(provider: ModelProvider, model: string): number {
  if (model.includes('7b') || model.includes('8b')) return 8192;
  if (model.includes('32b')) return 32768;
  if (model.includes('70b')) return 32768;
  return 8192;
}
