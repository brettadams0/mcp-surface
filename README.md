# mcp-surface

[![CI](https://github.com/brettadams0/mcp-surface/actions/workflows/ci.yml/badge.svg)](https://github.com/brettadams0/mcp-surface/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-surface.svg)](https://www.npmjs.com/package/mcp-surface)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An [MCP](https://modelcontextprotocol.io) server can complete the handshake, show as **Connected**
in every client, and still never be called by the model — because its tool list came back empty, a
schema doesn't compile, or `required` names a property that isn't there. Nothing errors. The
answers just get worse. `mcp-surface` connects the way a client does, reads back everything the
server advertises, checks it, and fails CI when it changes without you meaning it to. It reads the
server's raw `tools/list` response rather than the SDK's validated one, because the SDK rejects the
whole list when one tool is malformed, and then there is nothing left to report on.

**[Live demo](https://brettadams0.github.io/mcp-surface/)** — the package's own checks, bundled for
the browser: break a `tools/list` response and watch the report change as you type.

```sh
npx mcp-surface node ./src/index.js      # no install
npm install -D mcp-surface               # in a project; Node 22.12 or newer
```

Against [`test/fixtures/broken-server.js`](test/fixtures/broken-server.js), a server that completes
the handshake and that any client would show as connected:

```console
$ npx mcp-surface node ./broken-server.js

broken-fixture 1.0.0 (56ms)
5 tools · 0 resources · 0 prompts · capabilities: tools

  unsatisfiable — Requires an argument that its schema never defines.
  wrong_root_type — Declares an array where the spec requires an object.
  …

  error  wrong_root_type inputSchema.type is "array", but MCP requires "object" [schema-root-type]
  error  bad_schema inputSchema is not valid JSON Schema: … [schema-valid]
  error  unsatisfiable inputSchema.required lists "apiKey" with no matching entry in properties — those arguments can never be satisfied [schema-required-props]
  error  duplicate Advertised 2 times — only one of them is reachable by a client [tool-duplicate-name]
  info   bad_schema 1 input property has no description: count [schema-property-descriptions]

4 errors, 0 warnings, 1 info
```

## Does it catch what a client wouldn't?

The fixture above speaks raw JSON-RPC instead of using the TypeScript SDK, on purpose: the SDK
validates what it sends and would refuse to serve most of these faults. Python, Go and hand-written
servers have no such guard. Every fault in it is one a real server can ship without noticing, and
none of them breaks the handshake. CI runs the built CLI against it on every push and fails if it
exits zero, and against a healthy fixture that must exit zero.

The case that matters is a real one. Dependabot opened the same Zod 3 → 4 upgrade in all five of
the MCP servers that use this tool. In every one, lint and the unit tests passed, and the build
failed only at the `mcp-surface` snapshot step:

| Zod 3.25.76 → 4.6.7 | Unit tests passing | Tools whose `inputSchema` changed |
|---|---:|---:|
| [google-workspace-mcp](https://github.com/brettadams0/google-workspace-mcp/pull/15) | 33 / 33 | **23 / 23** |
| [supercell-mcp](https://github.com/brettadams0/supercell-mcp/pull/12) | 19 / 19 | 15 / 15 |
| [reddit-mcp](https://github.com/brettadams0/reddit-mcp/pull/13) | 27 / 27 | 11 / 12 |
| [yahoo-fantasy-mcp](https://github.com/brettadams0/yahoo-fantasy-mcp/pull/13) | 19 / 19 | 9 / 10 |
| [chesscom-mcp](https://github.com/brettadams0/chesscom-mcp/pull/12) | 14 / 14 | 8 / 9 |
| **All five** | **112 / 112** | **66 / 69** |

The schemas didn't break; they changed, and nothing else noticed. In google-workspace-mcp, 18 of the
23 differ only because Zod 4 stops emitting `additionalProperties: false` — 26 occurrences gone —
so the schema those tools advertise stopped forbidding extra arguments. The other five
also gained `pattern`s on email fields, an inlined `$ref`, and a new `maximum`. Whether that is
acceptable is a decision; the point is that it is now a decision someone makes in the pull
request, rather than a looser contract that ships unread. None of the five upgrades has been
merged.

The suite is 54 tests in three files, all passing. The end-to-end tests drive the two fixture
servers over real stdio, not mocks — but they are local fixtures, not third-party servers, so what
it misses on servers in the wild is only known from reports. If it passes a server your client
cannot use, or flags one that works, the **wrong verdict** issue template asks for exactly what is
needed to fix it.

## How it works

### Connecting

The target is a command (stdio) or a URL (Streamable HTTP, or SSE with `--transport sse`). The
client declares no capabilities of its own, so a server that gates tools behind client capabilities
still shows its unconditional set. A stdio server's stderr is captured rather than inherited, so a
chatty server doesn't write its logs into the report; it is shown only when the probe fails. The
client identifies itself in `initialize` with the real package version. Each request times out
after 20,000 ms unless `--timeout` says otherwise. ([`connect.ts`](src/connect.ts),
[`cli.ts`](src/cli.ts))

### Reading the surface

Each list — tools, resources, prompts — is requested only if the server declared that capability,
and paged until the server stops returning a cursor, or returns the same cursor twice. A list the
server declared but that then throws is recorded as a finding, not a crash, and the other lists are
still read. Malformed entries are coerced into shape without being dropped: a tool with a numeric
name or no schema still has to reach the checks, because reporting it is the point.
([`probe.ts`](src/probe.ts))

### Checks

Every rule is a pure function from the surface to a list of findings, grouped by area:
`schema.ts` (valid JSON Schema, object root, satisfiable `required`), `naming.ts` (characters
clients rewrite, case collisions, duplicates), `surface.ts` (empty surface, size heuristics),
`mutation.ts` (tools that look like they change state but declare no annotations) and `calls.ts`.
A rule that throws becomes a finding, so one bad rule doesn't cost the rest. Spec violations are
errors; heuristics are warnings or info, and name the signal that triggered them.
([`checks/`](src/checks/index.ts))

### Snapshots

`--update-snapshot` records the surface; `--snapshot` compares against it. Keys and tools are
sorted, so a server that serialises its schema from a `Map` doesn't produce a diff on every run.
The server's own version is left out of the comparison: a release bump is not a surface change, and
failing CI on it teaches people to re-record without reading. A UTF-8 BOM, which Windows editors and
PowerShell's `Set-Content -Encoding utf8` prepend, is stripped before parsing.
([`snapshot.ts`](src/snapshot.ts))

### Calling tools

`--call` invokes tools after the whole surface has been read, so a tool that hangs or crashes the
server still leaves a complete report. A tool is called only when it declares
`readOnlyHint: true` **and** takes no required arguments. Absence of an annotation is not consent,
and inventing plausible arguments for someone else's API is how you end up calling
`delete_user({ id: "test" })`. There is no flag to loosen either condition. Everything else is
listed as skipped, with the reason. ([`probe.ts`](src/probe.ts), [`calls.ts`](src/checks/calls.ts))

## Reading the list the SDK would reject

`client.listTools()` validates the response against the SDK's strict `ListToolsResultSchema`. One
malformed tool fails that validation, and the whole list goes with it, so a checker built on it can
only say "the response failed to parse" — for exactly the servers that need checking.
`mcp-surface` sends `tools/list` with a schema that accepts any object, keeps every entry, and lets
its own rules say which tool is broken and how.

Measured against the same `tools/list` response from the broken fixture, using SDK 1.32.1:

| | Tools read | Tools with findings |
|---|---:|---:|
| SDK `Client.listTools()` | **0 of 5** | — |
| `mcp-surface` | **5 of 5** | 4 (4 errors, 1 info) |

The SDK throws on the first issue, `tools.1.inputSchema.type: Invalid input: expected "object"`, and returns
nothing. The fixture is broken on purpose, so this shows the mechanism, not how often real servers
hit it. To reproduce:

```sh
npm run build && node scripts/sdk-vs-surface.mjs
```

The cost is that it has to do the SDK's job itself, defensively: names that aren't strings,
schemas that aren't objects, and `$ref` properties — a property defined by `$ref` has no inline
`description`, and was wrongly reported as undocumented until 0.1.2.

## Running it

Node 22.12 or newer.

```sh
mcp-surface node ./src/index.js                     # stdio
mcp-surface npx -y @scope/some-mcp-server           # stdio, from npm
mcp-surface https://example.com/mcp                 # Streamable HTTP
mcp-surface https://example.com/sse --transport sse # SSE
mcp-surface node ./src/index.js --snapshot mcp-surface.json --update-snapshot   # record; commit this
mcp-surface node ./src/index.js --snapshot mcp-surface.json                     # verify in CI
mcp-surface node ./src/index.js --call              # also invoke the tools that are safe to call
```

| Option | |
|---|---|
| `--transport <kind>` | `stdio`, `http` or `sse`; inferred from the target by default |
| `--cwd <dir>` | Working directory for a stdio server |
| `-e, --env KEY=VALUE` | Environment variable for a stdio server (repeatable) |
| `-H, --header KEY=VALUE` | HTTP header for a remote server (repeatable) |
| `--timeout <ms>` | Per-request timeout (default 20000) |
| `--snapshot <file>` | Compare the surface against a recorded snapshot |
| `--update-snapshot` | Record the current surface instead of comparing |
| `--skip <rule>` | Ignore a rule or check id (repeatable) |
| `--max-tools <n>` | Warn above this many tools (default 40) |
| `--max-definition-bytes <n>` | Warn when tool definitions exceed this (default 16384) |
| `--max-description-chars <n>` | Note descriptions longer than this (default 1024) |
| `--call` | Also invoke each tool that is safe to call, and report the result |
| `--fail-on <level>` | Exit non-zero at `error` (default), `warn` or `info` |
| `--json` | Machine-readable output |
| `--json-out <file>` | Write JSON to a file while keeping the readable report on stdout |

Exit codes: `0` clean; `1` findings at or above `--fail-on`, or the snapshot didn't match; `2` the
server could not be probed at all. Connection failure is kept separate on purpose — "the server
wouldn't start" and "the server started and its schemas are wrong" want different responses in CI.

Tool listing doesn't need credentials on most servers — auth is enforced when a tool is called,
not when it is listed — so a server can usually be checked in CI without secrets. Pass `-e` or `-H`
if yours needs them to start.

### Checks

| Rule | Level | |
|---|---|---|
| `empty-surface` | error | Connected, but advertises nothing |
| `list-failed` | error | A capability was declared in `initialize`, but its list call threw |
| `schema-valid` | error | An `inputSchema` or `outputSchema` isn't valid JSON Schema |
| `schema-missing` | error | A tool has no `inputSchema`, which the spec requires |
| `schema-root-type` | error | Schema root `type` isn't `"object"`, which MCP requires |
| `schema-required-props` | error | `required` names a property that isn't in `properties` |
| `tool-duplicate-name` | error | Two tools share a name; only one is reachable |
| `tool-naming` | warn | Name outside `[A-Za-z0-9_-]`, which some clients rewrite or reject |
| `tool-name-case-collision` | warn | Names that differ only by case |
| `tool-description-missing` | warn | The model has only the name to go on |
| `tool-annotations` | warn | Both `readOnlyHint` and `destructiveHint` set |
| `mutation-annotations` | warn | Looks like it changes state, declares no annotations |
| `tool-call-error` | error | `--call` only: an eligible tool returned `isError` |
| `tool-call-threw` | error | `--call` only: the call failed at the protocol level |
| `tool-call-none-eligible` | info | `--call` only: no tool met both conditions |
| `surface-tool-count` | warn | More tools than `--max-tools` |
| `surface-token-cost` | warn | Definitions larger than `--max-definition-bytes` |
| `tool-description-long` | info | A description longer than `--max-description-chars` |
| `schema-property-descriptions` | info | Input properties with no description |

`mutation-annotations` exists because clients that offer "auto-approve read-only tools" decide by
reading `readOnlyHint`. With no annotations, a tool that posts publicly and one that reads a profile
look the same, so either everything gets a prompt or nothing does. It guesses from names and
descriptions, so it warns rather than errors, names the signal it used, and respects verb order:
`get_post` reads, `post_comment` writes.

The three size limits are heuristics, not spec requirements. The defaults — 40 tools, 16,384 bytes
of definitions, 1,024 characters per description — are a starting point, not a measurement of
anyone's workload; tune them to your server. ([`types.ts`](src/types.ts))

### In GitHub Actions

```yaml
- uses: brettadams0/mcp-surface@v0
  with:
    target: node ./src/index.js
    snapshot: mcp-surface.json
```

or `- run: npx mcp-surface node ./src/index.js --snapshot mcp-surface.json`.

### As a library

```ts
import { parseTarget, probe, runChecks } from 'mcp-surface';

const result = await probe(parseTarget(['node', './src/index.js']), { timeoutMs: 20_000 });
const errors = runChecks(result.surface).filter((f) => f.level === 'error');

expect(errors).toEqual([]);
expect(result.surface.tools.map((t) => t.name)).toContain('get_weather');
```

### Used by

Each of these runs `mcp-surface` in CI against a committed snapshot, so renaming a tool, rewording
its description, changing its schema or dropping an annotation shows up as a diff in the pull
request that caused it.

| Server | Tools |
|---|---:|
| [google-workspace-mcp](https://github.com/brettadams0/google-workspace-mcp) | 23 |
| [supercell-mcp](https://github.com/brettadams0/supercell-mcp) | 15 |
| [reddit-mcp](https://github.com/brettadams0/reddit-mcp) | 12 |
| [yahoo-fantasy-mcp](https://github.com/brettadams0/yahoo-fantasy-mcp) | 10 |
| [chesscom-mcp](https://github.com/brettadams0/chesscom-mcp) | 9 |

## Development

```sh
npm ci
npm run typecheck
npm test                                                # vitest
npm run build

node dist/cli.js node test/fixtures/healthy-server.js  # must exit 0
node dist/cli.js node test/fixtures/broken-server.js   # must exit non-zero
```

CI runs that on Node 22.12, 22 and 24, then packs the tarball npm would publish, installs it into
an empty project, and runs its bin against the healthy fixture — which catches a `files` list or
`bin` path that works from the checkout but not from the registry.

The compiler moved from TypeScript 5.9.3 to 7.0.2 with no change to what ships: the emitted
`dist/*.js` and `dist/*.d.ts` are byte-identical between the two. Only the source maps differ.

A new check gets a fault in `broken-server.js` that trips it, a test, and a row in the table above.
While the version is `0.x`, a minor release may change the CLI or the JSON report; see
[CHANGELOG.md](CHANGELOG.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Layout

| | |
|---|---|
| [`src/cli.ts`](src/cli.ts) | flags, exit codes, report output; no checking logic |
| [`src/connect.ts`](src/connect.ts) | target parsing, transports, the `initialize` handshake |
| [`src/probe.ts`](src/probe.ts) | reads every list raw, and runs `--call`; never judges what it reads |
| [`src/checks/`](src/checks/index.ts) | the rules, one file per area; pure functions, no I/O |
| [`src/snapshot.ts`](src/snapshot.ts) | canonicalise, diff, read and write snapshots |
| [`src/report.ts`](src/report.ts) | text and `--json` output; the JSON shape is part of the CLI contract |
| [`src/version.ts`](src/version.ts) | the package version, read from `package.json`, never a literal |
| [`test/fixtures/`](test/fixtures) | a healthy and a broken server, both raw JSON-RPC over stdio |
| [`action.yml`](action.yml) | the composite GitHub Action |

## License

MIT — see [LICENSE](LICENSE).
