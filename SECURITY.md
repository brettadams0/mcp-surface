# Security

## What `mcp-surface` runs

A stdio target is a command, and `mcp-surface` executes it — the same trust
decision as running `npx <package>` yourself. Probing someone else's server
means running their code on your machine or CI runner.

`--call` additionally invokes tools, but only those that declare
`readOnlyHint: true` *and* take no required arguments. That makes it as safe as
the server's own annotations are honest; there is deliberately no flag to
loosen it.

## Reporting a vulnerability

Please email **adamsbrett00@gmail.com** rather than opening a public issue.
Include the version (`mcp-surface --version`), the target, and what you
observed. You'll get a reply within a few days.

Only the latest published version is supported.
