import type { ToolDefinition } from './registry.js';
import { WebFetchInputSchema } from '@arp/shared';
import { capOutput } from './utils.js';

const BLOCKED_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1', '::',
  '169.254.169.254', // AWS instance metadata
  'metadata.google.internal', // GCP metadata
]);

const PRIVATE_RANGE_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

/**
 * H-7: SSRF Protection — block requests to internal/private network addresses.
 */
function assertPublicUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Disallowed URL protocol: ${parsed.protocol}`);
  }

  if (BLOCKED_HOSTS.has(hostname) || PRIVATE_RANGE_RE.test(hostname)) {
    throw new Error(`SSRF protection: URL points to a private or internal network address (${hostname})`);
  }
}

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch content from a public URL via HTTP. Private/internal network URLs are blocked.',
  inputSchema: WebFetchInputSchema,
  async execute(input, context) {
    const { url, method, headers, body, timeoutMs } = input as {
      url: string;
      method: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs: number;
    };

    // H-7: Block SSRF attempts
    assertPublicUrl(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: { 'User-Agent': 'ARP-Agent/0.1', ...headers },
        body: body || undefined,
        signal: controller.signal,
      });

      const responseBody = await response.text();
      clearTimeout(timer);

      return {
        success: response.ok,
        output: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: capOutput(responseBody, context, 200000),
          url,
        },
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        durationMs: 0,
      };
    } catch (err) {
      clearTimeout(timer);
      return {
        success: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: 0,
      };
    }
  },
};
