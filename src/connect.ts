import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface TargetOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Force a transport instead of inferring it from the target. */
  transport?: 'stdio' | 'http' | 'sse';
  headers?: Record<string, string>;
}

export type Target =
  | { kind: 'stdio'; command: string; args: string[] }
  | { kind: 'http'; url: URL }
  | { kind: 'sse'; url: URL };

/**
 * A target is a URL (remote server) or a command plus arguments (local server).
 * `--transport` overrides the inference, which matters for servers that only
 * speak the deprecated SSE transport on an otherwise ordinary-looking URL.
 */
export function parseTarget(argv: string[], opts: TargetOptions = {}): Target {
  const [first, ...rest] = argv;
  if (!first) throw new Error('No target given. Pass a URL or a command to run.');

  const looksLikeUrl = /^https?:\/\//i.test(first);

  if (opts.transport === 'stdio') {
    return { kind: 'stdio', command: first, args: rest };
  }
  if (looksLikeUrl || opts.transport === 'http' || opts.transport === 'sse') {
    if (!looksLikeUrl) {
      throw new Error(`--transport ${opts.transport} needs an http(s) URL, got: ${first}`);
    }
    if (rest.length > 0) {
      throw new Error(`A URL target takes no extra arguments, got: ${rest.join(' ')}`);
    }
    return { kind: opts.transport === 'sse' ? 'sse' : 'http', url: new URL(first) };
  }
  return { kind: 'stdio', command: first, args: rest };
}

export interface Connection {
  client: Client;
  /** Resolves to everything the server wrote to stderr. Empty for HTTP targets. */
  readStderr(): string;
  close(): Promise<void>;
}

/**
 * Build a transport, connect, and complete the initialize handshake.
 *
 * stdio servers get `stderr: 'pipe'` rather than the SDK default of 'inherit' —
 * otherwise a chatty server writes its logs straight into our report output.
 * We capture it instead and surface it only when the probe fails.
 */
export async function connect(
  target: Target,
  opts: TargetOptions & { timeoutMs: number }
): Promise<Connection> {
  let transport: Transport;
  let stderrChunks: string[] = [];

  if (target.kind === 'stdio') {
    const stdio = new StdioClientTransport({
      command: target.command,
      args: target.args,
      cwd: opts.cwd,
      env: opts.env ? { ...(process.env as Record<string, string>), ...opts.env } : undefined,
      stderr: 'pipe'
    });
    // `stderr` is available synchronously once 'pipe' was requested.
    stdio.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString('utf8'));
    });
    transport = stdio;
  } else {
    const requestInit = opts.headers ? { headers: opts.headers } : undefined;
    transport =
      target.kind === 'sse'
        ? new SSEClientTransport(target.url, { requestInit })
        : new StreamableHTTPClientTransport(target.url, { requestInit });
  }

  const client = new Client(
    { name: 'mcp-surface', version: '0.1.0' },
    // Declare nothing: we only read the surface, so a server that gates tools
    // behind client capabilities should still show us its unconditional set.
    { capabilities: {} }
  );

  await client.connect(transport, { timeout: opts.timeoutMs });

  return {
    client,
    readStderr: () => stderrChunks.join(''),
    close: async () => {
      try {
        await client.close();
      } catch {
        // A server that dies on close is not a probe failure — we already
        // have the surface. Swallow so the report still prints.
      }
    }
  };
}
