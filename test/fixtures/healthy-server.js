#!/usr/bin/env node
/**
 * A well-formed MCP server. `mcp-surface` should exit 0 against this.
 *
 * Deliberately uses the low-level Server rather than McpServer: the high-level
 * API would validate these schemas for us, and the point of the fixtures is to
 * control exactly what goes on the wire.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'healthy-fixture', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'echo',
    description: 'Returns the message it was given, unchanged.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The text to echo back.' }
      },
      required: ['message']
    }
  },
  {
    name: 'add',
    description: 'Adds two numbers and returns the sum.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First addend.' },
        b: { type: 'number', description: 'Second addend.' }
      },
      required: ['a', 'b']
    },
    annotations: { readOnlyHint: true }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === 'echo') {
    return { content: [{ type: 'text', text: String(args?.message ?? '') }] };
  }
  if (name === 'add') {
    return { content: [{ type: 'text', text: String(Number(args?.a) + Number(args?.b)) }] };
  }
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

await server.connect(new StdioServerTransport());
