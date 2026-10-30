// Measures the claim the README makes in "Reading the list the SDK would
// reject": against the same tools/list response, the SDK's strict client
// rejects the whole list, while mcp-surface reads every tool and reports on
// each one. Run once after `npm run build`; the printed numbers are what the
// README cites.
//
//   node scripts/sdk-vs-surface.mjs [fixture]   # default: test/fixtures/broken-server.js
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parseTarget } from '../dist/connect.js';
import { probe } from '../dist/probe.js';
import { runChecks } from '../dist/checks/index.js';

const fixture =
  process.argv[2] ?? fileURLToPath(new URL('../test/fixtures/broken-server.js', import.meta.url));

// 1. The SDK's own client, exactly as an MCP host would call it.
const client = new Client({ name: 'sdk-vs-surface', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [fixture] }));
let sdk;
try {
  const res = await client.listTools();
  sdk = { ok: true, tools: res.tools.length };
} catch (err) {
  // The SDK throws a ZodError whose message is the JSON array of issues.
  const message = String(err?.message ?? err);
  let issues;
  try {
    issues = JSON.parse(message).map((i) => `${i.path.join('.')}: ${i.message}`);
  } catch {
    issues = [message.split('\n')[0]];
  }
  sdk = { ok: false, tools: 0, issues };
}
await client.close();

// 2. mcp-surface over the same server.
const result = await probe(parseTarget([process.execPath, fixture]), { timeoutMs: 20000 });
const findings = runChecks(result.surface);
const toolNames = new Set(result.surface.tools.map((t) => t.name));
const toolsWithFindings = new Set(findings.filter((f) => toolNames.has(f.subject)).map((f) => f.subject));

console.log(
  JSON.stringify(
    {
      fixture: relative(process.cwd(), fixture).replaceAll('\\', '/'),
      sdkListTools: sdk,
      mcpSurface: {
        toolsRead: result.surface.tools.length,
        toolsWithFindings: toolsWithFindings.size,
        findingsByLevel: Object.fromEntries(
          ['error', 'warn', 'info'].map((l) => [l, findings.filter((f) => f.level === l).length])
        )
      }
    },
    null,
    2
  )
);
