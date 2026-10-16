import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The package version, read from package.json rather than written as a literal.
 *
 * Both the CLI's `--version` and the `clientInfo` sent in `initialize` need it,
 * and both had drifted when they were literals. This file sits one level below
 * the package root whether it runs from `src/` (tests) or `dist/` (published).
 */
export const VERSION: string = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
).version;
