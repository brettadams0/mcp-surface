/**
 * Programmatic entry point, for using the checks inside your own test suite
 * rather than through the CLI. See README "Use it as a library".
 */
export { parseTarget, connect, type Target, type TargetOptions, type Connection } from './connect.js';
export { probe, callEligibility } from './probe.js';
export { allChecks, runChecks, type RunChecksOptions } from './checks/index.js';
export {
  toSnapshot,
  diffSnapshots,
  isEmptyDiff,
  readSnapshot,
  writeSnapshot,
  SNAPSHOT_VERSION,
  type Snapshot,
  type SnapshotDiff
} from './snapshot.js';
export { toJson, toText, countByLevel, type ReportInput } from './report.js';
export { DEFAULT_CHECK_CONFIG } from './types.js';
export type {
  Check,
  CheckConfig,
  Finding,
  Level,
  ProbeResult,
  PromptSurface,
  ResourceSurface,
  Surface,
  ToolSurface
} from './types.js';
