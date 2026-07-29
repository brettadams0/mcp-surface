# mcp-surface

See the tool surface your [MCP](https://modelcontextprotocol.io) server actually exposes. Connect the way a real client does, validate what comes back, and fail CI when that surface changes without you meaning it to.

```console
$ npx mcp-surface node ./src/index.js

chesscom 1.0.0 (405ms)
9 tools · 0 resources · 0 prompts · capabilities: tools

  chess_get_profile — Public profile info (name, title, country, followers, join date) for a …
  chess_get_stats — Rating and win/loss/draw stats per game format (bullet, blitz, rapid, d…
  …

  info   chess_get_profile 1 input property has no description: username [schema-property-descriptions]

0 errors, 0 warnings, 8 info
```

## Why

A broken MCP server usually does not look broken. It starts, it completes the handshake, the client lists it as **Connected** — and the model never calls anything, because the tool surface is empty, a schema doesn't compile, or a `required` field names a property that isn't there. Nothing errors. You just get worse answers.

`mcp-surface` connects the way a real client does and reports what it actually sees.

## Install

```sh
npx mcp-surface <target>          # no install
npm install -D mcp-surface        # in a project
```

Requires Node 20.19+.

## Usage

The target is either a command that starts a local server, or the URL of a remote one.

```sh
mcp-surface node ./src/index.js              # stdio
mcp-surface npx -y @scope/some-mcp-server    # stdio, from npm
mcp-surface https://example.com/mcp          # Streamable HTTP
mcp-surface https://example.com/sse --transport sse
```

| Option | |
|---|---|
| `--transport <kind>` | Force `stdio`, `http`, or `sse` instead of inferring from the target |
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
| `--fail-on <level>` | Exit non-zero at `error` (default), `warn`, or `info` |
| `--json` | Machine-readable output |
| `--json-out <file>` | Write JSON to a file while keeping the readable report on stdout |

### Exit codes

| | |
|---|---|
| `0` | Clean |
| `1` | Findings at or above `--fail-on`, or the snapshot didn't match |
| `2` | Could not probe the server at all |

Connection failure is deliberately separate from surface problems: in CI, "the server wouldn't start" and "the server started and its schemas are wrong" want different responses.

## Snapshot testing

The failure this catches: you refactor, a tool quietly stops being registered, every test still passes because none of them assert on the *surface*, and the regression ships.

```sh
mcp-surface node ./src/index.js --snapshot mcp-surface.json --update-snapshot   # record, commit this
mcp-surface node ./src/index.js --snapshot mcp-surface.json                     # verify in CI
```

```console
Snapshot mcp-surface.json
  + tool chess_get_clubs
  ~ tool chess_get_club: description changed
  Run with --update-snapshot if these changes are intended.
```

Snapshots are canonicalised — keys and tools are sorted, so reordering never produces a spurious diff. The server *version* is excluded on purpose: a release bump is not a surface change, and failing CI on it just teaches people to re-record reflexively, which defeats the point.

## In GitHub Actions

```yaml
- uses: brettadams0/mcp-surface@v0
  with:
    target: node ./src/index.js
    snapshot: mcp-surface.json
```

Or plainly:

```yaml
- run: npx mcp-surface node ./src/index.js --snapshot mcp-surface.json
```

## Checks

| Rule | Level | |
|---|---|---|
| `empty-surface` | error | Server connected but advertises nothing — the "Connected, but no tools" failure |
| `list-failed` | error | A capability was declared in `initialize` but its list call threw |
| `schema-valid` | error | A tool's `inputSchema`/`outputSchema` isn't valid JSON Schema |
| `schema-missing` | error | A tool has no `inputSchema`, which the spec requires |
| `schema-root-type` | error | Schema root `type` isn't `"object"`, which MCP requires |
| `schema-required-props` | error | `required` names a property that isn't in `properties` — unsatisfiable |
| `tool-duplicate-name` | error | Two tools share a name; only one is reachable |
| `tool-naming` | warn | Name outside `[A-Za-z0-9_-]`, which some clients rewrite or reject |
| `tool-name-case-collision` | warn | Names differing only by case |
| `tool-description-missing` | warn | The model has only the name to go on |
| `tool-annotations` | warn | Both `readOnlyHint` and `destructiveHint` set |
| `surface-tool-count` | warn | More tools than `--max-tools` (default 40) |
| `surface-token-cost` | warn | Definitions exceed `--max-definition-bytes` (default 16 KB) |
| `tool-description-long` | info | Description over `--max-description-chars` (default 1024) |
| `schema-property-descriptions` | info | Input properties with no description |

Silence any of them with `--skip <rule>`.

The three size limits are **heuristics, not spec requirements**, and the defaults are a starting point rather than a measurement of your workload — a server whose tools are short and unambiguous can carry more of them than one with sprawling schemas. Tune them to your own server and treat the warning as a prompt to check, not a verdict.

## Use it as a library

Useful when you'd rather assert on the surface from inside an existing test suite.

```ts
import { parseTarget, probe, runChecks } from 'mcp-surface';

const result = await probe(parseTarget(['node', './src/index.js']), { timeoutMs: 20_000 });
const errors = runChecks(result.surface).filter((f) => f.level === 'error');

expect(errors).toEqual([]);
expect(result.surface.tools.map((t) => t.name)).toContain('get_weather');
```

## Notes

Tool listing does not require credentials on most servers — auth is enforced when a tool is *called*, not when it's listed — so you can usually smoke-test a server in CI without secrets. Pass `-e` or `-H` if yours needs them to start.

`mcp-surface` deliberately bypasses the SDK's response validation when reading the surface. The SDK's strict `ListToolsResultSchema` rejects the *entire* list if one tool is malformed, which would reduce every report to "the response failed to parse" for precisely the servers worth checking. Reading the raw result and judging it here is what lets the report say *which* tool is broken and *how*. Servers built on the TypeScript SDK can't emit some of these faults at all, since it validates on the way out — but Python, Go, and hand-rolled servers have no such guard.

Built against `@modelcontextprotocol/sdk` 1.x, which is what the current server ecosystem uses.

## License

MIT
