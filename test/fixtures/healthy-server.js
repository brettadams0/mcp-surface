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
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'healthy-fixture', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
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
  },
  {
    // Read-only with no required arguments, so `--call` will invoke it.
    name: 'status',
    description: 'Reports that the server is running.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  }
];

const RESOURCES = [
  {
    uri: 'file:///readme.md',
    name: 'Readme',
    description: 'Project readme, in Markdown.',
    mimeType: 'text/markdown'
  }
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'file:///logs/{date}.log',
    name: 'Daily log',
    description: 'Log file for one day; {date} is YYYY-MM-DD.',
    mimeType: 'text/plain'
  }
];

const PROMPTS = [
  {
    name: 'summarize',
    description: 'Summarize a piece of text at a chosen length.',
    arguments: [
      { name: 'text', description: 'The text to summarize.', required: true },
      { name: 'length', description: 'Target length in sentences.', required: false }
    ]
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
  resourceTemplates: RESOURCE_TEMPLATES
}));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === 'echo') {
    return { content: [{ type: 'text', text: String(args?.message ?? '') }] };
  }
  if (name === 'add') {
    return { content: [{ type: 'text', text: String(Number(args?.a) + Number(args?.b)) }] };
  }
  if (name === 'status') {
    return { content: [{ type: 'text', text: 'ok' }] };
  }
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

await server.connect(new StdioServerTransport());
