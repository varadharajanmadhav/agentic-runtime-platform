import { estimateTokenCount } from '@arp/shared';
import type { ContextItem, ToolCall } from '@arp/shared';
import { adaptPrompt, getModelContextWindow, getModelRouter } from '@arp/ai';
import { createTokenBudget, allocateContextItems } from '@arp/ai';
import type { ModelProvider } from '@arp/shared';

export interface CompilePromptOptions {
  taskDescription: string;
  systemRole?: string;
  contextItems: ContextItem[];
  conversationHistory: Array<{ role: string; content: string }>;
  availableToolNames: string[];
  executionState?: {
    completedSteps: string[];
    failedSteps: string[];
    currentStep?: string;
  };
  provider: ModelProvider;
  model: string;
  workspaceDir?: string;
}

export interface CompiledPrompt {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: ContextItem[];
  totalTokens: number;
  compressionApplied: boolean;
}

const AGENT_SYSTEM_PROMPT = `You are ARP, an expert software engineering agent. You help developers understand, modify, debug, and improve code.

You have access to tools to:
- Read and write files
- Run terminal commands
- Search the codebase
- Fetch web content
- View git diffs
- View git commit logs and history (git_log)
- View specific git commits (git_show)
- Build and compile .NET/C# solutions or projects (dotnet_build)
- Run C# unit tests (dotnet_test)
- Run JavaScript/TypeScript npm scripts (npm_run)
- Install JavaScript/TypeScript node modules (npm_install)

## Tool selection rules — follow these exactly:

**Finding files by name** (user says "list files", "find files", "show files related to X"):
→ Use \`find_files\` with pattern=X. This searches recursively by FILENAME across all subdirectories.
→ NEVER use \`search_files\` for this — it searches file contents, not filenames.

**Searching inside file contents** (user says "find where X is used", "grep for X", "which files contain X"):
→ Use \`search_files\` with query=X.

**Exploring directory structure**:
→ Use \`print_tree\` to see the folder layout before deciding where to look.

Guidelines:
- Always verify your understanding before making changes
- Explain what you are doing and why
- Write clean, well-structured code
- Run tests after making changes when possible
- If you are unsure, ask for clarification
- Never make up file contents — use the read_file tool to check actual content`;

function trimConversationHistory(
  history: Array<{ role: string; content: string }>,
  maxTokens: number,
): Array<{ role: string; content: string }> {
  const trimmed: Array<{ role: string; content: string }> = [];
  let tokenCount = 0;

  // Go from newest to oldest to preserve context closest to the current turn
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const msgTokens = estimateTokenCount(msg.content);
    if (tokenCount + msgTokens > maxTokens) {
      if (trimmed.length === 0) {
        // If the newest message alone exceeds the limit, truncate it
        const truncatedContent = msg.content.slice(0, maxTokens * 4) + '\n... [history truncated]';
        trimmed.push({ role: msg.role, content: truncatedContent });
      }
      break;
    }
    trimmed.push(msg);
    tokenCount += msgTokens;
  }

  return trimmed.reverse();
}

export function compilePrompt(options: CompilePromptOptions): CompiledPrompt {
  const router = getModelRouter();
  const maxContextConstraint = router.getMaxContextWindowConstraint();
  const contextWindow = maxContextConstraint || getModelContextWindow(options.provider, options.model);
  const systemPrompt = buildSystemPrompt(options);
  const systemTokens = estimateTokenCount(systemPrompt);
  const toolSchemaTokens = options.availableToolNames.length * 200; // ~200 tokens per tool schema

  const budget = createTokenBudget({
    totalTokens: contextWindow,
    systemPromptTokens: systemTokens,
    toolSchemaTokens,
  });

  const { included, compressionApplied } = allocateContextItems(options.contextItems, budget);

  // Build context section
  let contextSection = '';
  if (included.length > 0) {
    contextSection = '\n\n## Relevant Context\n';
    for (const item of included) {
      contextSection += `\n### ${item.type}: ${item.path ?? 'unknown'}\n`;
      contextSection += '```\n' + item.content + '\n```\n';
    }
  }

  // Execution state section
  let stateSection = '';
  if (options.executionState) {
    const { completedSteps, failedSteps, currentStep } = options.executionState;
    if (completedSteps.length > 0 || failedSteps.length > 0) {
      stateSection = '\n\n## Execution State\n';
      if (completedSteps.length > 0) stateSection += `Completed: ${completedSteps.join(', ')}\n`;
      if (failedSteps.length > 0) stateSection += `Failed: ${failedSteps.join(', ')}\n`;
      if (currentStep) stateSection += `Current step: ${currentStep}\n`;
    }
  }

  const adapted = adaptPrompt({
    provider: options.provider,
    model: options.model,
    systemPrompt: systemPrompt + contextSection + stateSection,
    taskDescription: options.taskDescription,
    disableThinking: router.getDisableThinkingConstraint(),
  });

  const trimmedHistory = trimConversationHistory(options.conversationHistory, 10000);

  const messages = trimmedHistory.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Add current task as final user message if not in history
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    messages.push({
      role: 'user',
      content: options.taskDescription + adapted.userSuffix,
    });
  }

  // Calculate actual total tokens sent in the prompt (adapted system prompt + tool schemas + messages)
  const finalSystemTokens = estimateTokenCount(adapted.system);
  const totalTokens = finalSystemTokens + toolSchemaTokens + messages.reduce((sum, m) => sum + estimateTokenCount(m.content), 0);

  return {
    system: adapted.system,
    messages,
    context: included,
    totalTokens,
    compressionApplied,
  };
}

function buildSystemPrompt(options: CompilePromptOptions): string {
  let prompt = options.systemRole ?? AGENT_SYSTEM_PROMPT;
  if (options.workspaceDir) {
    prompt += `\n\nWorkspace directory: ${options.workspaceDir}`;
  }
  return prompt;
}
