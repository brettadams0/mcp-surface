import pc from 'picocolors';
import type { Finding, Level, ProbeResult } from './types.js';
import type { SnapshotDiff } from './snapshot.js';

const BADGE: Record<Level, string> = {
  error: pc.red('error'),
  warn: pc.yellow('warn '),
  info: pc.dim('info ')
};

export interface ReportInput {
  probe: ProbeResult;
  findings: Finding[];
  diff?: SnapshotDiff;
  snapshotPath?: string;
}

export function countByLevel(findings: Finding[]): Record<Level, number> {
  const counts: Record<Level, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.level] += 1;
  return counts;
}

/** Machine-readable output for `--json`. Shape is part of the CLI contract. */
export function toJson(input: ReportInput): string {
  const { probe, findings, diff } = input;
  return JSON.stringify(
    {
      server: probe.surface.server,
      durationMs: probe.durationMs,
      counts: {
        tools: probe.surface.tools.length,
        resources: probe.surface.resources.length,
        prompts: probe.surface.prompts.length
      },
      findings,
      summary: countByLevel(findings),
      ...(diff ? { snapshotDiff: diff } : {})
    },
    null,
    2
  );
}

export function toText(input: ReportInput): string {
  const { probe, findings, diff, snapshotPath } = input;
  const s = probe.surface;
  const out: string[] = [];

  out.push(
    `${pc.bold(s.server.name)} ${pc.dim(s.server.version)} ${pc.dim(`(${probe.durationMs}ms)`)}`
  );
  out.push(
    pc.dim(
      `${s.tools.length} tools · ${s.resources.length} resources · ${s.prompts.length} prompts · capabilities: ${
        Object.keys(s.capabilities).join(', ') || 'none'
      }`
    )
  );
  out.push('');

  if (s.tools.length > 0) {
    for (const tool of s.tools) {
      const summary = (tool.description ?? '').split('\n')[0]?.trim() ?? '';
      out.push(`  ${pc.cyan(tool.name)}${summary ? pc.dim(` — ${truncate(summary, 72)}`) : ''}`);
    }
    out.push('');
  }

  if (findings.length === 0) {
    out.push(pc.green('No findings.'));
  } else {
    // Errors first: in a long CI log the thing that failed the build should
    // not be buried under a dozen info lines.
    const order: Level[] = ['error', 'warn', 'info'];
    const sorted = [...findings].sort(
      (a, b) => order.indexOf(a.level) - order.indexOf(b.level)
    );
    for (const f of sorted) {
      const subject = f.subject ? `${pc.cyan(f.subject)} ` : '';
      out.push(`  ${BADGE[f.level]}  ${subject}${f.message} ${pc.dim(`[${f.rule}]`)}`);
    }
  }

  if (diff) {
    out.push('');
    out.push(pc.bold(`Snapshot ${snapshotPath ? pc.dim(snapshotPath) : ''}`));
    if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
      out.push(pc.green('  matches'));
    } else {
      for (const a of diff.added) out.push(`  ${pc.green('+')} ${a}`);
      for (const r of diff.removed) out.push(`  ${pc.red('-')} ${r}`);
      for (const c of diff.changed) out.push(`  ${pc.yellow('~')} ${c.subject}: ${c.detail}`);
      out.push(pc.dim('  Run with --update-snapshot if these changes are intended.'));
    }
  }

  const counts = countByLevel(findings);
  out.push('');
  out.push(
    `${counts.error} error${counts.error === 1 ? '' : 's'}, ${counts.warn} warning${
      counts.warn === 1 ? '' : 's'
    }, ${counts.info} info`
  );

  if (probe.stderr.trim() && counts.error > 0) {
    out.push('');
    out.push(pc.dim('Server stderr:'));
    for (const line of probe.stderr.trimEnd().split('\n').slice(-20)) {
      out.push(pc.dim(`  ${line}`));
    }
  }

  return out.join('\n');
}

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;
