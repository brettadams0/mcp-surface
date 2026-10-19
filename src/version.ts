import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The package version, read from package.json rather than written as a literal.
 *
 * Both the CLI's `--version` and the `clientInfo` sent in `initialize` need it,
 * and both had drifted when they were literals. This file sits one level below
 * the package root whether it runs from `src/` (tests) or `dist/` (published).
 *
 * A consumer that bundles the library moves this file, so the read can miss,
 * or find the consumer's own package.json. Neither may break the import or
 * report someone else's version: the name is checked, and the fallback is a
 * version that says it is unknown.
 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
    );
    if (pkg.name === 'mcp-surface' && typeof pkg.version === 'string') return pkg.version;
  } catch {
    // Fall through.
  }
  return '0.0.0-unknown';
}

export const VERSION: string = readVersion();
