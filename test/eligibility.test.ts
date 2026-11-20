import { describe, expect, it } from 'vitest';
import { callEligibility } from '../src/probe.js';
import type { ToolSurface } from '../src/types.js';

const t = (schema: unknown, annotations: Record<string, unknown> = { readOnlyHint: true }): ToolSurface => ({
  name: 'read_status',
  description: 'Read current status.',
  inputSchema: schema,
  annotations
});

describe('--call is deliberately conservative', () => {
  it('accepts an explicitly read-only zero-argument tool', () => {
    expect(callEligibility(t({ type: 'object', properties: {} }))).toEqual({ eligible: true });
  });

  it('does not call a destructive tool even when it is marked read-only', () => {
    const eligible = callEligibility(t(
      { type: 'object', properties: {} },
      { readOnlyHint: true, destructiveHint: true }
    ));
    expect(eligible.eligible).toBe(false);
    expect(eligible.reason).toContain('destructiveHint');
  });

  it('does not assume tools are safe when their annotations are missing', () => {
    expect(callEligibility(t({ type: 'object', properties: {} }, {})).eligible).toBe(false);
  });

  it('does not call tools with missing or malformed schemas', () => {
    expect(callEligibility(t(undefined)).eligible).toBe(false);
    expect(callEligibility(t({ type: 'array' })).eligible).toBe(false);
    expect(callEligibility(t({ type: 'object', properties: { x: { type: 'INVALID' } } })).eligible).toBe(false);
  });

  it('does not call a tool whose schema requires arguments', () => {
    expect(callEligibility(t({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    })).reason).toContain('needs required argument');
  });

  it('uses the actual schema semantics, not only its root required list', () => {
    // Empty required does not imply that {} is a valid argument: minProperties
    // and composed schemas can require input without a root required list.
    expect(callEligibility(t({ type: 'object', minProperties: 1 })).eligible).toBe(false);
    expect(callEligibility(t({
      type: 'object',
      allOf: [{ required: ['id'], properties: { id: { type: 'string' } } }]
    })).eligible).toBe(false);
    expect(callEligibility(t({
      type: 'object',
      if: { properties: { kind: { const: 'restricted' } } },
      then: { required: ['id'] }
    })).eligible).toBe(false);
  });

  it('accepts zero-argument 2020-12 tools using the proper dialect', () => {
    expect(callEligibility(t({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {},
      unevaluatedProperties: false
    })).eligible).toBe(true);
  });

  it('rejects an unrecognized declared dialect for safe tool invocation', () => {
    expect(callEligibility(t({ $schema: 'https://example.com/other', type: 'object' })).eligible).toBe(false);
  });
});
