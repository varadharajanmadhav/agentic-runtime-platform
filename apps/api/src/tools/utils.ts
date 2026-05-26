import type { ToolContext } from './registry.js';

export function capOutput(text: string, _context: ToolContext, defaultMax: number): string {
  if (text.length <= defaultMax) return text;

  return text.slice(0, defaultMax) + `\n\n... [output truncated to ${defaultMax} characters to fit context/rate limits]`;
}
