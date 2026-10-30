import type { Check, Finding, PromptSurface, ResourceSurface, ResourceTemplateSurface } from '../types.js';

/**
 * Report entries that appear more than once under whatever identifies them.
 * Clients index resources by URI and prompts by name, so a duplicate means one
 * of the two is simply unreachable.
 */
function duplicates<T>(
  items: T[],
  keyOf: (item: T) => string,
  rule: string,
  label: string
): Finding[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts]
    .filter(([, n]) => n > 1)
    .map(([key, n]) => ({
      rule,
      level: 'error' as const,
      subject: key,
      message: `${label} listed ${n} times — a client keys on this, so only one of them is reachable`
    }));
}

export const resourcesCheck: Check = {
  id: 'resources',
  run(surface) {
    const findings: Finding[] = [];

    for (const resource of surface.resources) {
      if (!resource.uri) {
        findings.push({
          rule: 'resource-uri-missing',
          level: 'error',
          subject: resource.name || '<unnamed resource>',
          message: 'No uri — the spec requires one, and without it the resource cannot be read'
        });
        continue;
      }

      // A URI without a scheme isn't a URI. Servers that hand back bare file
      // paths are the usual offender, and clients can't resolve them.
      if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource.uri)) {
        findings.push({
          rule: 'resource-uri-malformed',
          level: 'warn',
          subject: resource.uri,
          message: 'Has no URI scheme (expected something like "file:", "https:", or a custom one) — clients may not be able to resolve it'
        });
      }

      if (!resource.name?.trim()) {
        findings.push({
          rule: 'resource-name-missing',
          level: 'warn',
          subject: resource.uri,
          message: 'No name — clients display this in resource pickers, so the user sees only the raw URI'
        });
      }

      if (!resource.description?.trim()) {
        findings.push({
          rule: 'resource-description-missing',
          level: 'info',
          subject: resource.uri,
          message: 'No description — a model choosing between resources has only the name and URI to go on'
        });
      }

      if (!resource.mimeType?.trim()) {
        findings.push({
          rule: 'resource-mimetype-missing',
          level: 'info',
          subject: resource.uri,
          message: 'No mimeType — clients use it to decide how to render or parse the contents'
        });
      }
    }

    findings.push(
      ...duplicates(surface.resources, (r: ResourceSurface) => r.uri, 'resource-duplicate-uri', 'URI')
    );

    return findings;
  }
};

export const resourceTemplatesCheck: Check = {
  id: 'resource-templates',
  run(surface) {
    const findings: Finding[] = [];

    for (const template of surface.resourceTemplates) {
      if (!template.uriTemplate) {
        findings.push({
          rule: 'template-uri-missing',
          level: 'error',
          subject: template.name || '<unnamed template>',
          message: 'No uriTemplate — the spec requires one'
        });
        continue;
      }

      // A template with no placeholder is a plain resource wearing the wrong
      // hat: clients will offer to expand variables that don't exist.
      if (!/\{[^}]+\}/.test(template.uriTemplate)) {
        findings.push({
          rule: 'template-no-placeholder',
          level: 'warn',
          subject: template.uriTemplate,
          message: 'Contains no {placeholder} — if it takes no variables it belongs in resources/list, not resources/templates/list'
        });
      }

      if (!template.name?.trim()) {
        findings.push({
          rule: 'template-name-missing',
          level: 'warn',
          subject: template.uriTemplate,
          message: 'No name — clients display this when offering the template'
        });
      }

      if (!template.description?.trim()) {
        findings.push({
          rule: 'template-description-missing',
          level: 'info',
          subject: template.uriTemplate,
          message: 'No description — nothing explains what the placeholders expect'
        });
      }
    }

    findings.push(
      ...duplicates(
        surface.resourceTemplates,
        (t: ResourceTemplateSurface) => t.uriTemplate,
        'template-duplicate-uri',
        'uriTemplate'
      )
    );

    return findings;
  }
};

export const promptsCheck: Check = {
  id: 'prompts',
  run(surface) {
    const findings: Finding[] = [];

    for (const prompt of surface.prompts) {
      if (!prompt.name?.trim()) {
        findings.push({
          rule: 'prompt-name-missing',
          level: 'error',
          message: 'A prompt was advertised with an empty or non-string name — clients key on it'
        });
        continue;
      }

      if (!prompt.description?.trim()) {
        findings.push({
          rule: 'prompt-description-missing',
          level: 'warn',
          subject: prompt.name,
          message: 'No description — this is what a user sees when choosing a prompt from a list'
        });
      }

      const args = prompt.arguments ?? [];

      for (const [index, arg] of args.entries()) {
        if (!arg.name?.trim()) {
          findings.push({
            rule: 'prompt-argument-name-missing',
            level: 'error',
            subject: prompt.name,
            message: `Argument at position ${index} has no name, so it can never be supplied`
          });
        }
      }

      const undocumented = args.filter((a) => a.name && !a.description?.trim()).map((a) => a.name);
      if (undocumented.length > 0) {
        findings.push({
          rule: 'prompt-argument-descriptions',
          level: 'info',
          subject: prompt.name,
          message: `${undocumented.length} argument${undocumented.length === 1 ? '' : 's'} without a description: ${undocumented.join(', ')}`
        });
      }

      findings.push(
        ...duplicates(
          args.filter((a) => a.name),
          (a) => a.name,
          'prompt-duplicate-argument',
          `Argument of "${prompt.name}"`
        )
      );
    }

    findings.push(
      ...duplicates(surface.prompts, (p: PromptSurface) => p.name, 'prompt-duplicate-name', 'Prompt name')
    );

    return findings;
  }
};
