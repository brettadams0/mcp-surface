#!/usr/bin/env node
/**
 * A server that connects cleanly and looks healthy in any client, but whose
 * tool surface is broken in four separate ways. `mcp-surface` should exit 1.
 *
 * This speaks raw newline-delimited JSON-RPC rather than using the TypeScript
 * SDK, on purpose: the SDK validates outgoing `tools/list` results and would
 * refuse to serve most of these faults. Servers written in Python, Go, or by
 * hand have no such guard, which is exactly why a client-side checker is worth
 * having. Every fault below is one a real server can ship without noticing —
 * none of them break the handshake or surface an error to the user.
 */
import { createInterface } from 'node:readline';

const TOOLS = [
  {
    // `required` names a property that does not exist, so every call fails
    // argument validation. Typical after renaming a property and missing a spot.
    name: 'unsatisfiable',
    description: 'Requires an argument that its schema never defines.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A query.' } },
      required: ['query', 'apiKey']
    }
  },
  {
    // MCP requires the schema root to be an object.
    name: 'wrong_root_type',
    description: 'Declares an array where the spec requires an object.',
    inputSchema: { type: 'array', items: { type: 'string' } }
  },
  {
    // Not compilable JSON Schema: "str" is not a type.
    name: 'bad_schema',
    description: 'Uses a type keyword that is not valid JSON Schema.',
    inputSchema: { type: 'object', properties: { count: { type: 'str' } } }
  },
  {
    name: 'duplicate',
    description: 'First registration.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    // Same name again — clients index by name, so one of these is unreachable.
    name: 'duplicate',
    description: 'Second registration, shadowed by the first.',
    inputSchema: { type: 'object', properties: {} }
  }
];

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });

createInterface({ input: process.stdin }).on('line', (line) => {
  const text = line.trim();
  if (!text) return;

  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }

  // Notifications carry no id and expect no response.
  if (message.id === undefined) return;

  switch (message.method) {
    case 'initialize':
      reply(message.id, {
        // Echo the client's protocol version so this fixture keeps working as
        // the spec revision moves.
        protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'broken-fixture', version: '1.0.0' }
      });
      return;
    case 'tools/list':
      reply(message.id, { tools: TOOLS });
      return;
    case 'tools/call':
      reply(message.id, { content: [{ type: 'text', text: 'ok' }] });
      return;
    default:
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` }
      });
  }
});
