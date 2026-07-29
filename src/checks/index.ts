import { DEFAULT_CHECK_CONFIG, type Check, type CheckConfig, type Finding, type Surface } from '../types.js';
import { callResultsCheck } from './calls.js';
import { mutationAnnotationsCheck } from './mutation.js';
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
  mutationAnnotationsCheck,
  propertyDescriptionsCheck,
  callResultsCheck
];

export interface RunChecksOptions {
  /** Rule ids or check ids to skip, e.g. `['tool-description-missing']`. */
  skip?: string[];
  /** Override any of the size limits; unset fields keep their defaults. */
  config?: Partial<CheckConfig>;
}

/**
 * Run every check against a surface.
 *
 * A check that throws is reported as a finding rather than crashing the run —
 * one bad rule shouldn't cost you the other eight results.
 */
export function runChecks(surface: Surface, opts: RunChecksOptions = {}): Finding[] {
  const skip = new Set(opts.skip ?? []);
  const config: CheckConfig = { ...DEFAULT_CHECK_CONFIG, ...opts.config };
  const findings: Finding[] = [];

  for (const check of allChecks) {
    if (skip.has(check.id)) continue;
    try {
      findings.push(...check.run(surface, config));
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

export * from './calls.js';
export * from './mutation.js';
export * from './naming.js';
export * from './schema.js';
export * from './surface.js';
