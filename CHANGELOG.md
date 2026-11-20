# Changelog

Notable changes to `mcp-surface`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/) — while it is `0.x`, a minor bump
may change the CLI or the JSON report shape.

## [Unreleased]

## [0.4.0] — 2026-11-19

### Changed

- **Breaking: Node 22.12 or newer is required.** `engines.node` moves from `>=20.19.0` to
  `>=22.12.0`. Node 20 has been end-of-life since 2026-04-30, and vitest 5 requires `^22.12`. CI
  now runs on 22.12, 22 and 24.
- Built with TypeScript 7. The emitted `dist/*.js` and `dist/*.d.ts` are byte-identical to the
  TypeScript 5.9 build; only the source maps differ. Tests run on vitest 5.
- CI installs the packed tarball into an empty project and runs its bin, so a `files` list or
  `bin` path that only works from the checkout fails the build.

### Fixed

- Tool `inputSchema` and `outputSchema` now compile under their declared JSON Schema
  2020-12 or 2019-09 dialect, with draft-07 retained for older/unlabelled schemas.
  This prevents false errors such as the Chrome DevTools MCP tools that
  exposed the bug; an actual hosted probe of v1.13.0 confirmed 33 tools,
  zero schema errors and one definition-size warning. Unknown explicit dialects fail clearly rather than silently
  falling back to the wrong specification.
- A required key absent from local `properties` is only an impossible-arguments
  **error** for provably closed schemas. Open or composed schemas receive a warning
  instead; JSON Schema allows additional properties unless restricted.
- `--call` now refuses contradictory destructive/read-only annotations, invalid
  input schemas and schemas that reject empty arguments (including composed,
  conditional and `minProperties` rules). No tool calls occur without `--call`.
- The client now identifies itself in `initialize` with the real package
  version. It had been sending a hard-coded `0.1.0` since the first release.
  If the library is bundled into another package, where its own package.json
  can't be found, it reports `0.0.0-unknown` rather than failing to import or
  borrowing the host package's version.

### Security

- Refreshed transitive production dependencies within existing declared ranges to
  address the high-severity `body-parser` advisory and related Hono/fast-uri
  advisories. CI now checks production dependencies with
  `npm audit --omit=dev --audit-level=high`.

## [0.3.0] — 2026-07-28

### Added

- `--call` invokes each tool that declares `readOnlyHint: true` and takes no
  required arguments, and reports whether it worked. New rules:
  `tool-call-error`, `tool-call-threw`, `tool-call-none-eligible`.

## [0.2.0] — 2026-07-28

### Added

- `mutation-annotations`: warns when a tool looks like it changes state but
  declares no annotations, naming the signal that triggered it.

## [0.1.2] — 2026-07-28

### Fixed

- A property defined by `$ref` is no longer reported as undocumented.

## [0.1.1] — 2026-07-28

### Added

- `--max-tools`, `--max-definition-bytes` and `--max-description-chars` make the
  three size heuristics configurable.

## [0.1.0] — 2026-07-28

First release: probe over stdio, Streamable HTTP or SSE; schema, naming and
surface-size checks; canonicalised snapshots; JSON output; a composite GitHub
Action; and a release workflow that publishes through npm Trusted Publishing,
with provenance.

[Unreleased]: https://github.com/brettadams0/mcp-surface/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/brettadams0/mcp-surface/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/brettadams0/mcp-surface/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/brettadams0/mcp-surface/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/brettadams0/mcp-surface/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/brettadams0/mcp-surface/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/brettadams0/mcp-surface/releases/tag/v0.1.0
