# Changelog

Notable changes to `mcp-surface`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/) — while it is `0.x`, a minor bump
may change the CLI or the JSON report shape.

## [Unreleased]

### Fixed

- The client now identifies itself in `initialize` with the real package
  version. It had been sending a hard-coded `0.1.0` since the first release.

### Security

- Raised `@modelcontextprotocol/sdk` to 1.32 and refreshed the lockfile, which
  clears every open `npm audit` advisory — including GHSA-6qxp-vccf-f47h in the
  SDK's OAuth client and seven in `fast-uri`, reached through `ajv`.

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

[Unreleased]: https://github.com/brettadams0/mcp-surface/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/brettadams0/mcp-surface/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/brettadams0/mcp-surface/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/brettadams0/mcp-surface/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/brettadams0/mcp-surface/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/brettadams0/mcp-surface/releases/tag/v0.1.0
