import type { Check, Finding } from '../types.js';

/** Past roughly this many tools, selection accuracy degrades noticeably. */
const TOOL_COUNT_WARN = 40;
/** Descriptions are resent on every request; this is where the cost starts to bite. */
const DESCRIPTION_BUDGET_BYTES = 16_384;
/** A description this long is usually documentation that belongs elsewhere. */
const LONG_DESCRIPTION_CHARS = 1_024;

/**
 * The check this tool was written for: a server that connects cleanly and
 * advertises nothing. It reports healthy in every client UI, and the failure
 * only shows up as "the model never uses my tools".
 */
export const emptySurfaceCheck: Check = {
  id: 'empty-surface',
  run(surface) {
    const total = surface.tools.length + surface.resources.length + surface.prompts.length;
    if (total > 0) return [];

    const declared = ['tools', 'resources', 'prompts'].filter((c) => surface.capabilities[c]);

    return [
      {
        rule: 'empty-surface',
        level: 'error',
        message:
          declared.length > 0
            ? `Server connected and declared ${declared.join(', ')}, but every list came back empty — clients will show it as connected with nothing to call`
            : 'Server connected but declared no tools, resources, or prompts — there is nothing for a client to use'
      }
    ];
  }
};

/**
 * A capability declared in `initialize` whose list call then fails is strictly
 * worse than not declaring it: the client believes the capability exists.
 */
export const listErrorsCheck: Check = {
  id: 'list-failed',
  run(surface) {
    return surface.listErrors.map((e) => ({
      rule: 'list-failed',
      level: 'error' as const,
      message: `Server declared the "${e.capability}" capability but ${e.capability}/list failed: ${e.message}`
    }));
  }
};

export const descriptionsCheck: Check = {
  id: 'tool-descriptions',
  run(surface) {
    const findings: Finding[] = [];

    for (const tool of surface.tools) {
      const description = tool.description?.trim() ?? '';

      if (description === '') {
        findings.push({
          rule: 'tool-description-missing',
          level: 'warn',
          subject: tool.name,
          message: 'No description — the model has only the name to decide when to call this'
        });
      } else if (description.length > LONG_DESCRIPTION_CHARS) {
        findings.push({
          rule: 'tool-description-long',
          level: 'info',
          subject: tool.name,
          message: `Description is ${description.length} chars and is resent on every request; consider trimming toward ${LONG_DESCRIPTION_CHARS}`
        });
      }
    }

    return findings;
  }
};

export const surfaceSizeCheck: Check = {
  id: 'surface-size',
  run(surface) {
    const findings: Finding[] = [];

    if (surface.tools.length > TOOL_COUNT_WARN) {
      findings.push({
        rule: 'surface-tool-count',
        level: 'warn',
        message: `${surface.tools.length} tools advertised (soft limit ${TOOL_COUNT_WARN}) — large surfaces measurably hurt tool-selection accuracy`
      });
    }

    const bytes = surface.tools.reduce(
      (sum, tool) =>
        sum +
        Buffer.byteLength(tool.name, 'utf8') +
        Buffer.byteLength(tool.description ?? '', 'utf8') +
        Buffer.byteLength(JSON.stringify(tool.inputSchema ?? {}), 'utf8'),
      0
    );

    if (bytes > DESCRIPTION_BUDGET_BYTES) {
      findings.push({
        rule: 'surface-token-cost',
        level: 'warn',
        message: `Tool definitions total ~${(bytes / 1024).toFixed(1)} KB (soft limit ${DESCRIPTION_BUDGET_BYTES / 1024} KB) — this is resent on every request`
      });
    }

    return findings;
  }
};

/**
 * `readOnlyHint` and `destructiveHint` describe opposite things. A client that
 * auto-approves read-only calls will happily run a tool marked both.
 */
export const annotationsCheck: Check = {
  id: 'tool-annotations',
  run(surface) {
    const findings: Finding[] = [];

    for (const tool of surface.tools) {
      const a = tool.annotations;
      if (!a) continue;

      if (a.readOnlyHint === true && a.destructiveHint === true) {
        findings.push({
          rule: 'tool-annotations',
          level: 'warn',
          subject: tool.name,
          message:
            'Marked both readOnlyHint and destructiveHint — clients that auto-approve read-only tools may run this without asking'
        });
      }
    }

    return findings;
  }
};
