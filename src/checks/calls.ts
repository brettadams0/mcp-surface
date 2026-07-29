import type { Check, Finding } from '../types.js';

/**
 * Report the outcome of `--call`.
 *
 * A tool that takes no required arguments and is declared read-only should be
 * callable with no arguments — that is what those two declarations mean. If it
 * isn't, either the tool is broken or its annotations are wrong, and both are
 * worth failing a build over.
 *
 * Produces nothing at all when `--call` wasn't used.
 */
export const callResultsCheck: Check = {
  id: 'tool-call',
  run(surface) {
    if (!surface.calls) return [];
    const findings: Finding[] = [];

    for (const call of surface.calls) {
      if (call.status === 'ok' || call.status === 'skipped') continue;

      findings.push({
        rule: call.status === 'threw' ? 'tool-call-threw' : 'tool-call-error',
        level: 'error',
        subject: call.name,
        message:
          call.status === 'threw'
            ? `Call failed at the protocol level: ${call.reason ?? 'unknown error'}`
            : `Declared read-only with no required arguments, but calling it with none returned an error: ${call.reason ?? 'no detail'}`
      });
    }

    const attempted = surface.calls.filter((c) => c.status !== 'skipped');
    if (surface.tools.length > 0 && attempted.length === 0) {
      findings.push({
        rule: 'tool-call-none-eligible',
        level: 'info',
        message:
          'No tool was eligible to call: a tool must declare annotations.readOnlyHint = true and take no required arguments before it will be invoked'
      });
    }

    return findings;
  }
};
