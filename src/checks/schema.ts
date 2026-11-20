import { Ajv, type AnySchemaObject } from 'ajv';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv2020 from 'ajv/dist/2020.js';
import type { Check, Finding } from '../types.js';

/**
 * Tool schemas may explicitly use JSON Schema draft-07, 2019-09, or 2020-12.
 *
 * Ajv's default constructor only understands draft-07. Sending a 2020-12
 * schema to it fails at the $schema meta-schema lookup, even if the MCP tool
 * is correct. Compile each input/output schema with its declared dialect.
 * The dialect is selected per schema: servers can expose a mixture.
 *
 * Unlabelled schemas retain the historical draft-07 behavior for backward
 * compatibility. Unknown/unsupported dialects are reported rather than being
 * silently compiled using the wrong specification.
 */
const VALIDATOR_OPTIONS = { strict: false, allErrors: true, validateFormats: false } as const;

function makeValidators(): Record<'draft7' | 'draft2019' | 'draft2020', Ajv> {
  return {
    draft7: new Ajv(VALIDATOR_OPTIONS),
    draft2019: new Ajv2019(VALIDATOR_OPTIONS),
    draft2020: new Ajv2020(VALIDATOR_OPTIONS)
  };
}

function validatorFor(
  schema: Record<string, unknown>,
  validators: ReturnType<typeof makeValidators>
): Ajv {
  const dialect = schema.$schema;
  if (dialect === undefined) return validators.draft7;
  if (typeof dialect !== 'string') {
    throw new Error('$schema must be a string URI when present');
  }
  if (/^https?:\/\/json-schema\.org\/draft\/2020-12\/schema#?$/.test(dialect)) {
    return validators.draft2020;
  }
  if (/^https?:\/\/json-schema\.org\/draft\/2019-09\/schema#?$/.test(dialect)) {
    return validators.draft2019;
  }
  if (/^https?:\/\/json-schema\.org\/draft-07\/schema#?$/.test(dialect)) {
    return validators.draft7;
  }
  throw new Error(`Unsupported JSON Schema dialect ${JSON.stringify(dialect)}`);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A tool whose schema does not compile is unusable: the client can't validate
 * arguments and the model gets no reliable shape to fill in. This is the
 * highest-value check in the tool, so it is the only schema rule at `error`.
 */
export const schemaValidCheck: Check = {
  id: 'schema-valid',
  run(surface) {
    const findings: Finding[] = [];
    const validators = makeValidators();

    for (const tool of surface.tools) {
      // `inputSchema` is required by the spec; `outputSchema` is optional.
      if (tool.inputSchema === undefined) {
        findings.push({
          rule: 'schema-missing',
          level: 'error',
          subject: tool.name || '<unnamed tool>',
          message: 'No inputSchema — MCP requires one on every tool, even for tools that take no arguments'
        });
      }

      for (const [label, schema] of [
        ['inputSchema', tool.inputSchema],
        ['outputSchema', tool.outputSchema]
      ] as const) {
        if (schema === undefined) continue;

        if (!isObject(schema)) {
          findings.push({
            rule: 'schema-valid',
            level: 'error',
            subject: tool.name,
            message: `${label} is ${Array.isArray(schema) ? 'an array' : typeof schema}, expected a JSON Schema object`
          });
          continue;
        }

        if (schema.type !== 'object') {
          findings.push({
            rule: 'schema-root-type',
            level: 'error',
            subject: tool.name,
            message: `${label}.type is ${JSON.stringify(schema.type)}, but MCP requires "object"`
          });
        }

        try {
          validatorFor(schema, validators).compile(schema as AnySchemaObject);
        } catch (err) {
          findings.push({
            rule: 'schema-valid',
            level: 'error',
            subject: tool.name,
            message: `${label} is not valid JSON Schema: ${err instanceof Error ? err.message : String(err)}`
          });
        }
      }
    }
    return findings;
  }
};

/**
 * `required: ["foo"]` with no `properties.foo` makes a field impossible to
 * satisfy — every call fails validation. Cheap to write by accident when
 * renaming a property, and invisible until a model tries to call the tool.
 */
export const requiredPropsCheck: Check = {
  id: 'schema-required-props',
  run(surface) {
    const findings: Finding[] = [];

    for (const tool of surface.tools) {
      for (const [label, schema] of [
        ['inputSchema', tool.inputSchema],
        ['outputSchema', tool.outputSchema]
      ] as const) {
        if (!isObject(schema)) continue;

        const required = schema.required;
        if (!Array.isArray(required) || required.length === 0) continue;

        const properties = isObject(schema.properties) ? schema.properties : {};
        const missing = required.filter(
          (key): key is string => typeof key === 'string' && !(key in properties)
        );

        if (missing.length > 0) {
          findings.push({
            rule: 'schema-required-props',
            level: 'error',
            subject: tool.name,
            message: `${label}.required lists ${missing.map((m) => `"${m}"`).join(', ')} with no matching entry in properties — those arguments can never be satisfied`
          });
        }
      }
    }
    return findings;
  }
};

/**
 * A property with no description leaves the model guessing what to put in it.
 * Info-level: plenty of well-named properties are self-evident, so this is a
 * nudge rather than a verdict.
 */
export const propertyDescriptionsCheck: Check = {
  id: 'schema-property-descriptions',
  run(surface) {
    const findings: Finding[] = [];

    for (const tool of surface.tools) {
      if (!isObject(tool.inputSchema)) continue;
      const properties = tool.inputSchema.properties;
      if (!isObject(properties)) continue;

      const undocumented = Object.entries(properties)
        .filter(([, spec]) => {
          if (!isObject(spec)) return true;
          // A `$ref` carries its description at the reference target. Zod emits
          // these whenever two properties share one schema object, so flagging
          // them reports a property that is in fact documented.
          if (typeof spec.$ref === 'string') return false;
          const description = spec.description;
          return typeof description !== 'string' || description.trim() === '';
        })
        .map(([key]) => key);

      if (undocumented.length > 0) {
        findings.push({
          rule: 'schema-property-descriptions',
          level: 'info',
          subject: tool.name,
          message: `${undocumented.length} input propert${undocumented.length === 1 ? 'y has' : 'ies have'} no description: ${undocumented.join(', ')}`
        });
      }
    }
    return findings;
  }
};
