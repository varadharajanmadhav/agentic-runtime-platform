import { describe, expect, it } from 'vitest';
import { formatTaskError } from './executor.js';

describe('formatTaskError', () => {
  it('formats AI SDK provider response details without preferring stack traces', () => {
    const error = Object.assign(new Error('Provider returned error'), {
      name: 'AI_APICallError',
      statusCode: 400,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      responseBody: JSON.stringify({
        error: {
          message: 'No endpoints found that support tool use',
          code: 400,
        },
      }),
      stack: 'STACK SHOULD NOT BE SHOWN',
    });

    const formatted = formatTaskError(error);

    expect(formatted).toContain('AI_APICallError: Provider returned error');
    expect(formatted).toContain('HTTP status: 400');
    expect(formatted).toContain('URL: https://openrouter.ai/api/v1/chat/completions');
    expect(formatted).toContain('Provider response: No endpoints found that support tool use (400)');
    expect(formatted).not.toContain('STACK SHOULD NOT BE SHOWN');
  });
});
