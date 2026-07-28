import type { Check, Finding } from '../types.js';

/**
 * Clients key tools by name and many route them into function-calling APIs
 * with stricter charsets than MCP itself enforces. Staying inside
 * `[A-Za-z0-9_-]` keeps a server portable across those clients.
 */
const PORTABLE_NAME = /^[A-Za-z0-9_-]{1,128}$/;

export const namingCheck: Check = {
  id: 'tool-naming',
  run(surface) {
    const findings: Finding[] = [];

    for (const tool of surface.tools) {
      if (typeof tool.name !== 'string' || tool.name.trim() === '') {
        findings.push({
          rule: 'tool-naming',
          level: 'error',
          message: 'A tool was advertised with an empty or non-string name'
        });
        continue;
      }
      if (!PORTABLE_NAME.test(tool.name)) {
        findings.push({
          rule: 'tool-naming',
          level: 'warn',
          subject: tool.name,
          message:
            'Name falls outside [A-Za-z0-9_-]{1,128}; some clients reject or rewrite it when mapping tools to function calls'
        });
      }
    }

    findings.push(...duplicates(surface.tools.map((t) => t.name).filter(Boolean)));
    return findings;
  }
};

/**
 * An exact duplicate is unambiguously broken — one of the two is unreachable
 * because clients index by name. A case-only difference is legal but a common
 * source of "the wrong tool ran" reports, so it warns instead.
 */
function duplicates(names: string[]): Finding[] {
  const findings: Finding[] = [];
  const exact = new Map<string, number>();
  const folded = new Map<string, string[]>();

  for (const name of names) {
    exact.set(name, (exact.get(name) ?? 0) + 1);
    const key = name.toLowerCase();
    const bucket = folded.get(key);
    if (bucket) {
      if (!bucket.includes(name)) bucket.push(name);
    } else {
      folded.set(key, [name]);
    }
  }

  for (const [name, count] of exact) {
    if (count > 1) {
      findings.push({
        rule: 'tool-duplicate-name',
        level: 'error',
        subject: name,
        message: `Advertised ${count} times — only one of them is reachable by a client`
      });
    }
  }

  for (const variants of folded.values()) {
    if (variants.length > 1) {
      findings.push({
        rule: 'tool-name-case-collision',
        level: 'warn',
        message: `Names differ only by case: ${variants.join(', ')} — easy to invoke the wrong one`
      });
    }
  }

  return findings;
}
