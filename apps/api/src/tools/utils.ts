import type { ToolContext } from './registry.js';

export function capOutput(text: string, context: ToolContext, defaultMax: number): string {
  const isGroq = context.provider === 'groq';
  const limit = isGroq ? 8000 : defaultMax; // Strict limit for Groq to stay under 12k TPM
  if (text.length <= limit) return text;

  return text.slice(0, limit) + `\n\n... [output truncated to ${limit} characters to fit context/rate limits]`;
}
