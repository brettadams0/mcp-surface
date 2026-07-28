import { z } from 'zod';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { connect, type Target, type TargetOptions } from './connect.js';
import type { ProbeResult, PromptSurface, ResourceSurface, Surface, ToolSurface } from './types.js';

/**
 * Accept any object the server sends back.
 *
 * This is the crux of the tool. `client.listTools()` validates the response
 * against the SDK's strict `ListToolsResultSchema`, so a server with one
 * malformed tool has its *entire* list rejected — and a checker that reports
 * "the list failed to parse" instead of "tool X has an invalid schema" is
 * useless for exactly the servers that need checking. We take the raw result
 * and let our own checks judge it.
 */
const AnyResult = z.looseObject({});

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Page through a list method until the server stops returning a cursor.
 * A server that echoes the same cursor forever would loop, so we stop if it repeats.
 */
async function listAll(
  client: Client,
  method: string,
  key: string,
  timeoutMs: number
): Promise<unknown[]> {
  const items: unknown[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (;;) {
    const raw = (await client.request(
      { method, params: cursor === undefined ? {} : { cursor } },
      AnyResult,
      { timeout: timeoutMs }
    )) as Record<string, unknown>;

    const page = raw[key];
    if (!Array.isArray(page)) {
      throw new Error(
        `${method} returned no "${key}" array (got ${page === undefined ? 'nothing' : typeof page})`
      );
    }
    items.push(...page);

    const next = str(raw.nextCursor);
    if (next === undefined || seenCursors.has(next)) return items;
    seenCursors.add(next);
    cursor = next;
  }
}

/**
 * Coerce a raw list entry into the shape the checks expect, without discarding
 * anything malformed — a tool with a numeric name or a missing schema must
 * still reach the checks, because reporting it is the whole point.
 */
function asTool(entry: unknown): ToolSurface {
  const o = isRecord(entry) ? entry : {};
  return {
    name: str(o.name) ?? '',
    title: str(o.title),
    description: str(o.description),
    inputSchema: o.inputSchema,
    outputSchema: o.outputSchema,
    annotations: isRecord(o.annotations) ? o.annotations : undefined
  };
}

function asResource(entry: unknown): ResourceSurface {
  const o = isRecord(entry) ? entry : {};
  return {
    uri: str(o.uri) ?? '',
    name: str(o.name),
    description: str(o.description),
    mimeType: str(o.mimeType)
  };
}

function asPrompt(entry: unknown): PromptSurface {
  const o = isRecord(entry) ? entry : {};
  return { name: str(o.name) ?? '', description: str(o.description) };
}

/**
 * Connect to a server and read back everything a client would see.
 *
 * Each list is attempted only if the server declared the matching capability.
 * A declared-but-failing list is recorded in `listErrors` rather than aborting
 * the probe: that combination is one of the bugs this tool exists to catch,
 * and the other capabilities are still worth reporting.
 */
export async function probe(
  target: Target,
  opts: TargetOptions & { timeoutMs: number }
): Promise<ProbeResult> {
  const startedAt = Date.now();
  const connection = await connect(target, opts);
  const { client } = connection;

  try {
    const capabilities = (client.getServerCapabilities() ?? {}) as Record<string, unknown>;
    const version = client.getServerVersion();
    const listErrors: Surface['listErrors'] = [];

    const collect = async <T>(
      capability: 'tools' | 'resources' | 'prompts',
      method: string,
      map: (entry: unknown) => T
    ): Promise<T[]> => {
      if (!capabilities[capability]) return [];
      try {
        return (await listAll(client, method, capability, opts.timeoutMs)).map(map);
      } catch (err) {
        listErrors.push({ capability, message: errorMessage(err) });
        return [];
      }
    };

    const surface: Surface = {
      server: { name: version?.name ?? '<unknown>', version: version?.version ?? '<unknown>' },
      capabilities,
      instructions: client.getInstructions(),
      tools: await collect('tools', 'tools/list', asTool),
      resources: await collect('resources', 'resources/list', asResource),
      prompts: await collect('prompts', 'prompts/list', asPrompt),
      listErrors
    };

    return { surface, stderr: connection.readStderr(), durationMs: Date.now() - startedAt };
  } finally {
    await connection.close();
  }
}
