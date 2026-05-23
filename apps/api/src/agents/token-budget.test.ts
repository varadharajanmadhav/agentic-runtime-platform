import { describe, it, expect } from 'vitest';
import { createTokenBudget, allocateContextItems, estimatePromptTokens } from '@arp/ai';
import type { ContextItem } from '@arp/shared';

describe('Token Budget Allocation', () => {
  describe('createTokenBudget', () => {
    it('should split tokens into correct reserves', () => {
      const budget = createTokenBudget({
        totalTokens: 10000,
        systemPromptTokens: 1000,
        toolSchemaTokens: 1500,
      });

      // Output reserve is 20% of 10000 = 2000
      expect(budget.output).toBe(2000);
      // System reserve is Math.max(1000, 10000 * 0.10) = 1000
      expect(budget.system).toBe(1000);
      // Tool reserve is Math.max(1500, 10000 * 0.15) = 1500
      expect(budget.tools).toBe(1500);
      // Context budget = 10000 - 1000 - 1500 - 2000 = 5500
      expect(budget.context).toBe(5500);
      expect(budget.remaining).toBe(5500);
    });
  });

  describe('allocateContextItems', () => {
    it('should sort context items by relevance score and include those that fit', () => {
      const items: ContextItem[] = [
        { id: '1', type: 'file', content: 'hello', relevanceScore: 0.5, tokenCount: 1000, metadata: {} },
        { id: '2', type: 'file', content: 'world', relevanceScore: 0.9, tokenCount: 2000, metadata: {} },
        { id: '3', type: 'file', content: '!', relevanceScore: 0.1, tokenCount: 500, metadata: {} },
      ];

      const budget = createTokenBudget({
        totalTokens: 10000,
        systemPromptTokens: 1000,
        toolSchemaTokens: 1500,
      }); // Context budget is 5500

      const { included, excluded, compressionApplied } = allocateContextItems(items, budget);

      // Should be sorted by relevance: id 2 (0.9), id 1 (0.5), id 3 (0.1)
      expect(included.length).toBe(3);
      expect(included[0].id).toBe('2');
      expect(included[1].id).toBe('1');
      expect(included[2].id).toBe('3');
      expect(excluded.length).toBe(0);
      expect(compressionApplied).toBe(false);
    });

    it('should compress/truncate items that exceed the remaining budget', () => {
      const items: ContextItem[] = [
        { id: '1', type: 'file', content: 'a'.repeat(4000), relevanceScore: 0.9, tokenCount: 1000, metadata: {} }, // ~1000 tokens
        { id: '2', type: 'file', content: 'b'.repeat(12000), relevanceScore: 0.5, tokenCount: 3000, metadata: {} }, // ~3000 tokens
      ];

      // Context budget: 2000 tokens
      const budget = {
        total: 5000,
        system: 1000,
        tools: 1000,
        output: 1000,
        context: 2000,
        used: 0,
        remaining: 2000,
      };

      const { included, excluded, compressionApplied } = allocateContextItems(items, budget);

      // Item 1 fits completely: 1000 tokens used. Remaining = 1000.
      // Item 2 has 3000 tokens, doesn't fit completely, should be compressed to ~1000 tokens.
      expect(included.length).toBe(2);
      expect(included[0].id).toBe('1');
      expect(included[1].id).toBe('2');
      expect(included[1].metadata?.compressed).toBe(true);
      expect(included[1].content).toContain('[content truncated for token budget]');
      expect(compressionApplied).toBe(true);
      expect(excluded.length).toBe(0);
    });
  });

  describe('estimatePromptTokens', () => {
    it('should return estimated sum of system, messages, context, and tools', () => {
      const tokens = estimatePromptTokens({
        systemPrompt: 'System',
        messages: [{ role: 'user', content: 'Hello' }],
        contextItems: [{ id: '1', type: 'file', content: 'ctx', relevanceScore: 1, tokenCount: 50, metadata: {} }],
        toolSchemas: [{ name: 'tool' }],
      });
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
