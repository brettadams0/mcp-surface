import type { Check, Finding, Surface } from '../types.js';
import { namingCheck } from './naming.js';
import { propertyDescriptionsCheck, requiredPropsCheck, schemaValidCheck } from './schema.js';
import {
  annotationsCheck,
  descriptionsCheck,
  emptySurfaceCheck,
  listErrorsCheck,
  surfaceSizeCheck
} from './surface.js';

export const allChecks: Check[] = [
  emptySurfaceCheck,
  listErrorsCheck,
  schemaValidCheck,
  requiredPropsCheck,
  namingCheck,
  descriptionsCheck,
  surfaceSizeCheck,
  annotationsCheck,
  propertyDescriptionsCheck
];

export interface RunChecksOptions {
  /** Rule ids or check ids to skip, e.g. `['tool-description-missing']`. */
  skip?: string[];
}

/**
 * Run every check against a surface.
 *
 * A check that throws is reported as a finding rather than crashing the run —
 * one bad rule shouldn't cost you the other eight results.
 */
export function runChecks(surface: Surface, opts: RunChecksOptions = {}): Finding[] {
  const skip = new Set(opts.skip ?? []);
  const findings: Finding[] = [];

  for (const check of allChecks) {
    if (skip.has(check.id)) continue;
    try {
      findings.push(...check.run(surface));
    } catch (err) {
      findings.push({
        rule: 'check-crashed',
        level: 'warn',
        subject: check.id,
        message: `Check threw and was skipped: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }

  return findings.filter((f) => !skip.has(f.rule));
}

export * from './naming.js';
export * from './schema.js';
export * from './surface.js';
