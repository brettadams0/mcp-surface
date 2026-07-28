import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Surface } from './types.js';

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  snapshotVersion: number;
  server: { name: string; version: string };
  capabilities: string[];
  tools: Array<{
    name: string;
    description: string;
    inputSchema: unknown;
    outputSchema?: unknown;
    annotations?: Record<string, unknown>;
  }>;
  resources: Array<{ uri: string; name: string; mimeType?: string }>;
  prompts: Array<{ name: string; description: string }>;
}

/**
 * Recursively sort object keys so a snapshot is stable under key reordering.
 * Without this, a server that serialises its schema from a `Map` produces a
 * spurious diff on every run.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

/**
 * Reduce a live surface to the parts worth guarding in version control.
 *
 * Server *version* is deliberately excluded from comparison (see `diffSnapshots`)
 * — bumping your package version shouldn't fail CI. Everything recorded here is
 * something a client can observe and therefore something a consumer can break on.
 */
export function toSnapshot(surface: Surface): Snapshot {
  return canonical({
    snapshotVersion: SNAPSHOT_VERSION,
    server: surface.server,
    capabilities: Object.keys(surface.capabilities).sort(),
    tools: [...surface.tools]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((t) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema,
        ...(t.outputSchema !== undefined ? { outputSchema: t.outputSchema } : {}),
        ...(t.annotations !== undefined ? { annotations: t.annotations } : {})
      })),
    resources: [...surface.resources]
      .sort((a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0))
      .map((r) => ({ uri: r.uri, name: r.name ?? '', ...(r.mimeType ? { mimeType: r.mimeType } : {}) })),
    prompts: [...surface.prompts]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((p) => ({ name: p.name, description: p.description ?? '' }))
  }) as Snapshot;
}

export interface SnapshotDiff {
  added: string[];
  removed: string[];
  changed: Array<{ subject: string; detail: string }>;
}

export const isEmptyDiff = (d: SnapshotDiff): boolean =>
  d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;

/**
 * Compare a recorded snapshot against the current one.
 *
 * `server.version` is ignored on purpose: a release bump is not a surface
 * change, and failing CI on it would train people to run `--update` reflexively,
 * which defeats the point of having a snapshot at all.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiff {
  const diff: SnapshotDiff = { added: [], removed: [], changed: [] };

  if (before.server.name !== after.server.name) {
    diff.changed.push({
      subject: 'server.name',
      detail: `${before.server.name} -> ${after.server.name}`
    });
  }

  diffKeyed(before.capabilities, after.capabilities, (c) => c, 'capability', diff, () => null);

  diffKeyed(
    before.tools,
    after.tools,
    (t) => t.name,
    'tool',
    diff,
    (b, a) => {
      const parts: string[] = [];
      if (b.description !== a.description) parts.push('description');
      if (JSON.stringify(b.inputSchema) !== JSON.stringify(a.inputSchema)) parts.push('inputSchema');
      if (JSON.stringify(b.outputSchema) !== JSON.stringify(a.outputSchema)) parts.push('outputSchema');
      if (JSON.stringify(b.annotations) !== JSON.stringify(a.annotations)) parts.push('annotations');
      return parts.length > 0 ? `${parts.join(', ')} changed` : null;
    }
  );

  diffKeyed(before.resources, after.resources, (r) => r.uri, 'resource', diff, (b, a) =>
    b.mimeType !== a.mimeType ? `mimeType ${b.mimeType ?? 'none'} -> ${a.mimeType ?? 'none'}` : null
  );

  diffKeyed(before.prompts, after.prompts, (p) => p.name, 'prompt', diff, (b, a) =>
    b.description !== a.description ? 'description changed' : null
  );

  return diff;
}

function diffKeyed<T>(
  before: T[],
  after: T[],
  keyOf: (item: T) => string,
  label: string,
  diff: SnapshotDiff,
  compare: (before: T, after: T) => string | null
): void {
  const beforeMap = new Map(before.map((item) => [keyOf(item), item]));
  const afterMap = new Map(after.map((item) => [keyOf(item), item]));

  for (const [key, afterItem] of afterMap) {
    const beforeItem = beforeMap.get(key);
    if (!beforeItem) {
      diff.added.push(`${label} ${key}`);
      continue;
    }
    const detail = compare(beforeItem, afterItem);
    if (detail) diff.changed.push({ subject: `${label} ${key}`, detail });
  }

  for (const key of beforeMap.keys()) {
    if (!afterMap.has(key)) diff.removed.push(`${label} ${key}`);
  }
}

export async function readSnapshot(path: string): Promise<Snapshot | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  // Windows editors and PowerShell's `Set-Content -Encoding utf8` prepend a
  // BOM. JSON.parse rejects it with an opaque "Unexpected token" that gives no
  // hint the file is otherwise fine, so strip it before parsing.
  let parsed: Snapshot;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, '')) as Snapshot;
  } catch (err) {
    throw new Error(
      `Snapshot at ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (parsed.snapshotVersion !== SNAPSHOT_VERSION) {
    throw new Error(
      `Snapshot at ${path} is version ${parsed.snapshotVersion}, this build writes version ${SNAPSHOT_VERSION}. Re-record it with --update-snapshot.`
    );
  }
  return parsed;
}

export async function writeSnapshot(path: string, snapshot: Snapshot): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}
