/** Severity of a finding. Only `error` affects the exit code. */
export type Level = 'error' | 'warn' | 'info';

export interface Finding {
  /** Stable kebab-case rule id, e.g. `schema-invalid`. Safe to grep in CI logs. */
  rule: string;
  level: Level;
  /** What the finding is about — usually a tool name. Omitted for surface-wide findings. */
  subject?: string;
  message: string;
}

/** A tool exactly as the server advertised it, with the fields we care about. */
export interface ToolSurface {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

export interface ResourceSurface {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface PromptSurface {
  name: string;
  description?: string;
}

/**
 * Everything a client can see about a server after `initialize`.
 * This is the object checks run against and the object snapshots record.
 */
export interface Surface {
  server: { name: string; version: string };
  protocolVersion?: string;
  capabilities: Record<string, unknown>;
  instructions?: string;
  tools: ToolSurface[];
  resources: ResourceSurface[];
  prompts: PromptSurface[];
  /**
   * Capabilities the server declared but whose list call failed. Distinguishes
   * "declared tools, list threw" from "never declared tools" — the first is a bug.
   */
  listErrors: Array<{ capability: 'tools' | 'resources' | 'prompts'; message: string }>;
}

export interface ProbeResult {
  surface: Surface;
  /** Anything the server wrote to stderr during the probe (stdio targets only). */
  stderr: string;
  durationMs: number;
}

/**
 * Tunable limits for the size-related checks.
 *
 * These are heuristics, not spec requirements. The defaults are a starting
 * point, not a measurement of your workload — a server whose tools are all
 * short and unambiguous can carry more of them than one with sprawling
 * schemas. Override them rather than treating a warning as a verdict.
 */
export interface CheckConfig {
  /** Warn above this many tools. */
  maxTools: number;
  /** Warn when serialised tool definitions exceed this many bytes. */
  maxDefinitionBytes: number;
  /** Note descriptions longer than this many characters. */
  maxDescriptionChars: number;
}

export const DEFAULT_CHECK_CONFIG: CheckConfig = {
  maxTools: 40,
  maxDefinitionBytes: 16_384,
  maxDescriptionChars: 1_024
};

/**
 * A check reads the surface and reports what it finds. Checks never throw.
 * Checks that don't care about limits may omit the `config` parameter.
 */
export interface Check {
  id: string;
  run(surface: Surface, config: CheckConfig): Finding[];
}
