#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, InvalidArgumentError } from 'commander';
import pc from 'picocolors';
import { parseTarget } from './connect.js';
import { probe } from './probe.js';
import { runChecks } from './checks/index.js';
import { DEFAULT_CHECK_CONFIG } from './types.js';
import { countByLevel, toJson, toText } from './report.js';
import {
  diffSnapshots,
  isEmptyDiff,
  readSnapshot,
  toSnapshot,
  writeSnapshot
} from './snapshot.js';

/**
 * Exit codes are the CLI's contract with CI:
 *   0  clean
 *   1  findings at or above the failure threshold, or a snapshot mismatch
 *   2  could not probe the server at all (connect/handshake failed)
 * Anything else is a bug in this tool.
 */
const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_UNREACHABLE = 2;

function parsePairs(value: string, previous: Record<string, string> = {}) {
  const eq = value.indexOf('=');
  if (eq <= 0) throw new InvalidArgumentError(`Expected KEY=VALUE, got "${value}"`);
  return { ...previous, [value.slice(0, eq)]: value.slice(eq + 1) };
}

function parsePositiveInt(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new InvalidArgumentError(`Expected a positive number, got "${value}"`);
  return n;
}

// dist/cli.js sits one level below the package root.
const VERSION = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
).version as string;

const program = new Command();

program
  .name('mcp-surface')
  .description(
    'Smoke-test an MCP server: connect, read its tool surface, validate it, and diff against a recorded snapshot.'
  )
  .argument(
    '<target...>',
    'URL of a remote server, or the command and arguments that start a local one'
  )
  .option('--transport <kind>', 'force transport: stdio | http | sse (default: inferred)')
  .option('--cwd <dir>', 'working directory for a stdio server')
  .option('-e, --env <KEY=VALUE>', 'environment variable for a stdio server (repeatable)', parsePairs)
  .option('-H, --header <KEY=VALUE>', 'HTTP header for a remote server (repeatable)', parsePairs)
  .option('--timeout <ms>', 'per-request timeout in milliseconds', parsePositiveInt, 20_000)
  .option('--snapshot <file>', 'compare the surface against this snapshot file')
  .option('--update-snapshot', 'write the current surface to the snapshot file instead of comparing')
  .option('--skip <rule>', 'rule or check id to ignore (repeatable)', (v: string, prev: string[] = []) => [...prev, v])
  .option('--max-tools <n>', 'warn above this many tools', parsePositiveInt, DEFAULT_CHECK_CONFIG.maxTools)
  .option(
    '--max-definition-bytes <n>',
    'warn when serialised tool definitions exceed this many bytes',
    parsePositiveInt,
    DEFAULT_CHECK_CONFIG.maxDefinitionBytes
  )
  .option(
    '--max-description-chars <n>',
    'note descriptions longer than this',
    parsePositiveInt,
    DEFAULT_CHECK_CONFIG.maxDescriptionChars
  )
  .option('--fail-on <level>', 'exit non-zero at this level or above: error | warn | info', 'error')
  .option(
    '--call',
    'additionally invoke each tool that declares readOnlyHint and takes no required arguments, and report the result'
  )
  .option('--json', 'emit machine-readable JSON instead of the text report')
  .option('--json-out <file>', 'also write the JSON report here, keeping the text report on stdout')
  // Read from package.json rather than a literal, which had already drifted a
  // version behind — `--version` lying is worse than not having it.
  .version(VERSION)
  .showHelpAfterError();

program.parse();

const opts = program.opts<{
  transport?: 'stdio' | 'http' | 'sse';
  cwd?: string;
  env?: Record<string, string>;
  header?: Record<string, string>;
  timeout: number;
  snapshot?: string;
  updateSnapshot?: boolean;
  skip?: string[];
  maxTools: number;
  maxDefinitionBytes: number;
  maxDescriptionChars: number;
  call?: boolean;
  failOn: 'error' | 'warn' | 'info';
  json?: boolean;
  jsonOut?: string;
}>();

const targetArgv = program.args;

async function main(): Promise<number> {
  if (opts.transport && !['stdio', 'http', 'sse'].includes(opts.transport)) {
    throw new Error(`--transport must be stdio, http, or sse (got "${opts.transport}")`);
  }
  if (!['error', 'warn', 'info'].includes(opts.failOn)) {
    throw new Error(`--fail-on must be error, warn, or info (got "${opts.failOn}")`);
  }
  if (opts.updateSnapshot && !opts.snapshot) {
    throw new Error('--update-snapshot needs --snapshot <file> to know where to write.');
  }

  const target = parseTarget(targetArgv, {
    transport: opts.transport,
    cwd: opts.cwd,
    env: opts.env
  });

  // A failure to reach the server is categorically different from a surface
  // problem, so it gets its own exit code and never prints a findings report.
  let result;
  try {
    result = await probe(target, {
      cwd: opts.cwd,
      env: opts.env,
      headers: opts.header,
      timeoutMs: opts.timeout,
      call: opts.call
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
    } else {
      process.stderr.write(`${pc.red('Could not probe the server:')} ${message}\n`);
    }
    return EXIT_UNREACHABLE;
  }

  const findings = runChecks(result.surface, {
    skip: opts.skip,
    config: {
      maxTools: opts.maxTools,
      maxDefinitionBytes: opts.maxDefinitionBytes,
      maxDescriptionChars: opts.maxDescriptionChars
    }
  });
  const current = toSnapshot(result.surface);
  let diff;

  if (opts.snapshot) {
    if (opts.updateSnapshot) {
      await writeSnapshot(opts.snapshot, current);
      if (!opts.json) {
        process.stderr.write(`${pc.green('Wrote snapshot')} ${pc.dim(opts.snapshot)}\n`);
      }
    } else {
      const recorded = await readSnapshot(opts.snapshot);
      if (recorded === null) {
        throw new Error(
          `No snapshot at ${opts.snapshot}. Create it with --snapshot ${opts.snapshot} --update-snapshot.`
        );
      }
      diff = diffSnapshots(recorded, current);
    }
  }

  const report = { probe: result, findings, diff, snapshotPath: opts.snapshot };
  process.stdout.write(`${opts.json ? toJson(report) : toText(report)}\n`);

  // One probe, both formats — so CI can log a readable report and still hand
  // structured output to a later step without connecting to the server twice.
  if (opts.jsonOut) {
    await mkdir(dirname(opts.jsonOut), { recursive: true });
    await writeFile(opts.jsonOut, `${toJson(report)}\n`, 'utf8');
  }

  const counts = countByLevel(findings);
  const threshold =
    opts.failOn === 'info'
      ? counts.error + counts.warn + counts.info
      : opts.failOn === 'warn'
        ? counts.error + counts.warn
        : counts.error;

  if (threshold > 0) return EXIT_FINDINGS;
  if (diff && !isEmptyDiff(diff)) return EXIT_FINDINGS;
  return EXIT_OK;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`${pc.red('mcp-surface:')} ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = EXIT_UNREACHABLE;
  });
