# Contributing

The most useful report is a server that `mcp-surface` got wrong: one it passed that a client could
not use, or one it flagged that works. Use the **wrong verdict** template and include the
`--json` output. A fault that shows up in a real server, especially one not built on the
TypeScript SDK, is worth more than a hypothetical one.

## Setup

Node 20.19 or newer. CI runs 20.19, 22 and 24.

```sh
npm ci
```

## What CI runs

```sh
npm run typecheck
npm test                                            # vitest
npm run build

node dist/cli.js node test/fixtures/healthy-server.js   # must exit 0
node dist/cli.js node test/fixtures/broken-server.js    # must exit non-zero
```

The last two start real servers over stdio and go through the same connect path a user's would,
not a mock.

## Adding a check

- One rule per finding, named `area-what` (`schema-root-type`, `tool-call-threw`), in the file
  under `src/checks/` for its area.
- The level follows the evidence. A spec violation that stops a client from using the tool is an
  `error`. A heuristic is a `warn` or `info` and names the signal that triggered it, the way
  `mutation-annotations` does.
- Add a fault to `test/fixtures/broken-server.js` that trips it, a test in `test/checks.test.ts`,
  and a row in the README's checks table.
- A heuristic threshold gets a flag, and its default is described as a starting point, not a
  measurement.
- The surface is read without the SDK's response validation, on purpose: it rejects the whole
  list when one tool is malformed. A change that routes listing back through it will not be
  merged.

## Compatibility

While the version is `0.x`, a minor release may change the CLI or the JSON report. A patch release
does not. Any change to either goes in `CHANGELOG.md` under `[Unreleased]`.

## Security

Probing a stdio target runs it. Report vulnerabilities as described in [SECURITY.md](SECURITY.md),
not in a public issue.
