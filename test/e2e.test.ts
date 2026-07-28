import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTarget } from '../src/connect.js';
import { probe } from '../src/probe.js';
import { runChecks } from '../src/checks/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);
const OPTS = { timeoutMs: 20_000 };

/**
 * These spawn real servers over a real stdio transport. Slower than the unit
 * tests, but they are the only thing that proves the connect/probe path works
 * against an actual MCP implementation rather than a hand-built Surface.
 */
describe('end-to-end against a real stdio server', () => {
  it('reports a clean surface for the healthy fixture', async () => {
    const result = await probe(parseTarget(['node', fixture('healthy-server.js')]), OPTS);

    expect(result.surface.server.name).toBe('healthy-fixture');
    expect(result.surface.tools.map((t) => t.name).sort()).toEqual(['add', 'echo']);
    expect(runChecks(result.surface)).toEqual([]);
  }, 30_000);

  it('finds every planted fault in the broken fixture', async () => {
    const result = await probe(parseTarget(['node', fixture('broken-server.js')]), OPTS);
    const findings = runChecks(result.surface);
    const errors = findings.filter((f) => f.level === 'error');

    expect(errors.map((f) => f.rule).sort()).toEqual([
      'schema-required-props',
      'schema-root-type',
      'schema-valid',
      'tool-duplicate-name'
    ]);

    expect(errors.find((f) => f.rule === 'schema-required-props')?.subject).toBe('unsatisfiable');
    expect(errors.find((f) => f.rule === 'schema-root-type')?.subject).toBe('wrong_root_type');
    expect(errors.find((f) => f.rule === 'schema-valid')?.subject).toBe('bad_schema');
    expect(errors.find((f) => f.rule === 'tool-duplicate-name')?.subject).toBe('duplicate');
  }, 30_000);

  it('surfaces a connection failure rather than hanging', async () => {
    await expect(
      probe(parseTarget(['node', fixture('does-not-exist.js')]), { timeoutMs: 5_000 })
    ).rejects.toThrow();
  }, 30_000);
});
