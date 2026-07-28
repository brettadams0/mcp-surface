import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/checks/index.js';
import { diffSnapshots, toSnapshot } from '../src/snapshot.js';
import type { Surface, ToolSurface } from '../src/types.js';

const tool = (over: Partial<ToolSurface> = {}): ToolSurface => ({
  name: 'get_thing',
  description: 'Gets a thing.',
  inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The id.' } } },
  ...over
});

const surface = (over: Partial<Surface> = {}): Surface => ({
  server: { name: 'test-server', version: '1.0.0' },
  capabilities: { tools: {} },
  tools: [tool()],
  resources: [],
  prompts: [],
  listErrors: [],
  ...over
});

const rules = (s: Surface) => runChecks(s).map((f) => f.rule);
const find = (s: Surface, rule: string) => runChecks(s).find((f) => f.rule === rule);

describe('a healthy server', () => {
  it('produces no findings', () => {
    expect(runChecks(surface())).toEqual([]);
  });
});

describe('empty-surface', () => {
  it('errors when a server declares tools but lists none', () => {
    const f = find(surface({ tools: [] }), 'empty-surface');
    expect(f?.level).toBe('error');
    expect(f?.message).toContain('declared tools');
  });

  it('errors when a server declares nothing at all', () => {
    const f = find(surface({ tools: [], capabilities: {} }), 'empty-surface');
    expect(f?.level).toBe('error');
    expect(f?.message).toContain('declared no tools');
  });
});

describe('list-failed', () => {
  it('errors when a declared capability fails to list', () => {
    const s = surface({ listErrors: [{ capability: 'tools', message: 'boom' }] });
    const f = find(s, 'list-failed');
    expect(f?.level).toBe('error');
    expect(f?.message).toContain('boom');
  });
});

describe('schema checks', () => {
  it('rejects a non-object schema', () => {
    const f = find(surface({ tools: [tool({ inputSchema: 'nope' })] }), 'schema-valid');
    expect(f?.level).toBe('error');
    expect(f?.message).toContain('expected a JSON Schema object');
  });

  it('rejects a root type that is not "object"', () => {
    const s = surface({ tools: [tool({ inputSchema: { type: 'array' } })] });
    expect(find(s, 'schema-root-type')?.level).toBe('error');
  });

  it('rejects schema that does not compile', () => {
    const s = surface({
      tools: [tool({ inputSchema: { type: 'object', properties: { a: { type: 'nonsense' } } } })]
    });
    expect(find(s, 'schema-valid')?.level).toBe('error');
  });

  it('catches required entries with no matching property', () => {
    const s = surface({
      tools: [
        tool({
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id', 'ghost']
          }
        })
      ]
    });
    const f = find(s, 'schema-required-props');
    expect(f?.level).toBe('error');
    expect(f?.message).toContain('"ghost"');
    expect(f?.message).not.toContain('"id"');
  });

  it('validates outputSchema too', () => {
    const s = surface({ tools: [tool({ outputSchema: { type: 'string' } })] });
    expect(find(s, 'schema-root-type')?.message).toContain('outputSchema');
  });

  it('flags undocumented properties at info level only', () => {
    const s = surface({
      tools: [tool({ inputSchema: { type: 'object', properties: { id: { type: 'string' } } } })]
    });
    const f = find(s, 'schema-property-descriptions');
    expect(f?.level).toBe('info');
    expect(f?.message).toContain('id');
  });
});

describe('naming', () => {
  it('errors on an exact duplicate name', () => {
    const s = surface({ tools: [tool(), tool()] });
    expect(find(s, 'tool-duplicate-name')?.level).toBe('error');
  });

  it('warns on a case-only collision', () => {
    const s = surface({ tools: [tool({ name: 'getThing' }), tool({ name: 'getthing' })] });
    expect(find(s, 'tool-name-case-collision')?.level).toBe('warn');
    expect(rules(s)).not.toContain('tool-duplicate-name');
  });

  it('warns on characters that some clients reject', () => {
    const s = surface({ tools: [tool({ name: 'get thing!' })] });
    expect(find(s, 'tool-naming')?.level).toBe('warn');
  });
});

describe('descriptions and annotations', () => {
  it('warns when a tool has no description', () => {
    expect(find(surface({ tools: [tool({ description: '  ' })] }), 'tool-description-missing')?.level).toBe('warn');
  });

  it('warns when a tool claims to be both read-only and destructive', () => {
    const s = surface({
      tools: [tool({ annotations: { readOnlyHint: true, destructiveHint: true } })]
    });
    expect(find(s, 'tool-annotations')?.level).toBe('warn');
  });

  it('warns past the tool-count soft limit', () => {
    const many = Array.from({ length: 41 }, (_, i) => tool({ name: `tool_${i}` }));
    expect(find(surface({ tools: many }), 'surface-tool-count')?.level).toBe('warn');
  });
});

describe('skip', () => {
  it('drops findings by rule id', () => {
    const s = surface({ tools: [tool({ description: '' })] });
    const kept = runChecks(s, { skip: ['tool-description-missing'] }).map((f) => f.rule);
    expect(kept).not.toContain('tool-description-missing');
  });
});

describe('snapshots', () => {
  it('is stable under key and tool reordering', () => {
    const a = toSnapshot(surface({ tools: [tool({ name: 'b' }), tool({ name: 'a' })] }));
    const b = toSnapshot(surface({ tools: [tool({ name: 'a' }), tool({ name: 'b' })] }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('reports added and removed tools', () => {
    const before = toSnapshot(surface({ tools: [tool({ name: 'a' })] }));
    const after = toSnapshot(surface({ tools: [tool({ name: 'b' })] }));
    const d = diffSnapshots(before, after);
    expect(d.added).toEqual(['tool b']);
    expect(d.removed).toEqual(['tool a']);
  });

  it('reports a changed input schema', () => {
    const before = toSnapshot(surface());
    const after = toSnapshot(
      surface({ tools: [tool({ inputSchema: { type: 'object', properties: {} } })] })
    );
    const d = diffSnapshots(before, after);
    expect(d.changed).toEqual([{ subject: 'tool get_thing', detail: 'inputSchema changed' }]);
  });

  it('ignores a server version bump', () => {
    const before = toSnapshot(surface());
    const after = toSnapshot(surface({ server: { name: 'test-server', version: '2.0.0' } }));
    const d = diffSnapshots(before, after);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
  });

  it('reports a server rename', () => {
    const before = toSnapshot(surface());
    const after = toSnapshot(surface({ server: { name: 'renamed', version: '1.0.0' } }));
    expect(diffSnapshots(before, after).changed[0]?.subject).toBe('server.name');
  });
});
