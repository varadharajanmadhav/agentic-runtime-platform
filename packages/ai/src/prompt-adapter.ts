import type { ModelProvider } from '@arp/shared';

export interface PromptAdapterOptions {
  provider: ModelProvider;
  model: string;
  systemPrompt: string;
  taskDescription: string;
  includeChainOfThought?: boolean;
  disableThinking?: boolean;
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
  const modelLower = model.toLowerCase();
  
  let isSmallModel = false;
  const match = modelLower.match(/([0-9]+(?:\.[0-9]+)?)(b)/);
  if (match) {
    const size = parseFloat(match[1]);
    isSmallModel = size <= 16;
  } else {
    isSmallModel = modelLower.includes('7b') || 
                   modelLower.includes('8b') || 
                   modelLower.includes('3b') ||
                   modelLower.includes('1b') ||
                   modelLower.includes('2b') ||
                   modelLower.includes('1.5b') ||
                   modelLower.includes('4b') ||
                   modelLower.includes('small') ||
                   modelLower.includes('mini');
  }

  let maxContextTokens = isSmallModel ? 8000 : 32000;

  if (process.env.MAX_CONTEXT_WINDOW) {
    const customMax = parseInt(process.env.MAX_CONTEXT_WINDOW, 10);
    if (!isNaN(customMax) && customMax > 0) {
      maxContextTokens = customMax;
    }
  }

  let system = options.systemPrompt;

  // Small models benefit from explicit chain-of-thought instructions
  if ((isSmallModel || options.includeChainOfThought) && !options.disableThinking) {
    system += `\n\n## Instructions\nThink step by step before acting. When you need to use a tool, explain briefly what you will do and why before calling it.`;
  }

  // Explicit JSON schema reminder for models with weaker function-calling
  system += `\n\nIMPORTANT: Always use the provided tools when you need to read files, run commands, or search code. Never make up file contents or command output.`;

  if (options.disableThinking) {
    system += `\n\nIMPORTANT: Do NOT include any reasoning, explanation, step-by-step thinking, or <think> tags. Output the tool calls or answers directly.`;
  }

  return {
    system,
    userPrefix: '',
    userSuffix: (isSmallModel && !options.disableThinking) ? '\n\nRemember to think step by step and use tools when needed.' : '',
    toolCallFormat: 'native',
    maxContextTokens,
  };
}

// Model context window sizes for token budgeting
export function getModelContextWindow(provider: ModelProvider, model: string): number {
  if (process.env.MAX_CONTEXT_WINDOW) {
    const customMax = parseInt(process.env.MAX_CONTEXT_WINDOW, 10);
    if (!isNaN(customMax) && customMax > 0) {
      return customMax;
    }
  }

  const modelLower = model.toLowerCase();
  
  let isSmallModel = false;
  const match = modelLower.match(/([0-9]+(?:\.[0-9]+)?)(b)/);
  if (match) {
    const size = parseFloat(match[1]);
    isSmallModel = size <= 16;
  } else {
    isSmallModel = modelLower.includes('7b') || 
                   modelLower.includes('8b') || 
                   modelLower.includes('3b') ||
                   modelLower.includes('1b') ||
                   modelLower.includes('2b') ||
                   modelLower.includes('1.5b') ||
                   modelLower.includes('4b') ||
                   modelLower.includes('small') ||
                   modelLower.includes('mini');
  }

  if (isSmallModel) return 8192;
  if (modelLower.includes('32b')) return 32768;
  if (modelLower.includes('70b')) return 32768;
  return 8192;
}
