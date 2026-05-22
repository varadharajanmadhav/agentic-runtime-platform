import { estimateTokenCount } from '@arp/shared';
import type { ContextItem } from '@arp/shared';

export interface TokenBudget {
  total: number;
  system: number;      // Reserved for system prompt
  tools: number;       // Reserved for tool schemas
  output: number;      // Reserved for model output
  context: number;     // Available for context
  used: number;        // Currently allocated
  remaining: number;   // Still available
}

export interface TokenBudgetOptions {
  totalTokens: number;
  systemPromptTokens: number;
  toolSchemaTokens: number;
  outputReserveRatio?: number; // default 0.20
  systemReserveRatio?: number; // default 0.10
  toolReserveRatio?: number;   // default 0.15
}

export function createTokenBudget(options: TokenBudgetOptions): TokenBudget {
  const outputReserve = Math.floor(options.totalTokens * (options.outputReserveRatio ?? 0.20));
  const systemReserve = Math.max(options.systemPromptTokens, Math.floor(options.totalTokens * (options.systemReserveRatio ?? 0.10)));
  const toolReserve = Math.max(options.toolSchemaTokens, Math.floor(options.totalTokens * (options.toolReserveRatio ?? 0.15)));
  const contextBudget = options.totalTokens - systemReserve - toolReserve - outputReserve;

  return {
    total: options.totalTokens,
    system: systemReserve,
    tools: toolReserve,
    output: outputReserve,
    context: contextBudget,
    used: 0,
    remaining: contextBudget,
  };
}

export function allocateContextItems(
  items: ContextItem[],
  budget: TokenBudget,
): { included: ContextItem[]; excluded: ContextItem[]; compressionApplied: boolean } {
  // Sort by relevance score descending
  const sorted = [...items].sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  const included: ContextItem[] = [];
  const excluded: ContextItem[] = [];
  let tokensUsed = 0;
  let compressionApplied = false;

  for (const item of sorted) {
    if (tokensUsed + item.tokenCount <= budget.context) {
      included.push(item);
      tokensUsed += item.tokenCount;
    } else {
      // Try to compress the item
      const compressedItem = compressContextItem(item, budget.context - tokensUsed);
      if (compressedItem) {
        included.push(compressedItem);
        tokensUsed += compressedItem.tokenCount;
        compressionApplied = true;
      } else {
        excluded.push(item);
      }
    }
  }

  return { included, excluded, compressionApplied };
}

function compressContextItem(item: ContextItem, availableTokens: number): ContextItem | null {
  if (availableTokens < 50) return null; // Too few tokens to be useful

  const maxChars = availableTokens * 4; // ~4 chars per token
  if (item.content.length <= maxChars) return item;

  // Truncate with ellipsis and add note
  const truncated = item.content.slice(0, maxChars - 100) + '\n... [content truncated for token budget]';
  return {
    ...item,
    content: truncated,
    tokenCount: estimateTokenCount(truncated),
    metadata: { ...item.metadata, compressed: true },
  };
}

export function estimatePromptTokens({
  systemPrompt,
  messages,
  contextItems,
  toolSchemas,
}: {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  contextItems: ContextItem[];
  toolSchemas: unknown[];
}): number {
  let total = estimateTokenCount(systemPrompt);
  for (const msg of messages) {
    total += estimateTokenCount(msg.content) + 4; // ~4 overhead per message
  }
  for (const item of contextItems) {
    total += item.tokenCount;
  }
  total += estimateTokenCount(JSON.stringify(toolSchemas));
  return total;
}
