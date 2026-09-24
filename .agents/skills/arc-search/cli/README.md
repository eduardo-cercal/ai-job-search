# arc-cli

CLI for searching remote tech jobs on **Arc.dev**, a global remote-tech job platform.

**Data source**: Arc's server-rendered `__NEXT_DATA__` JSON payload, embedded directly in
each page — no separate API call.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> Keep request volume low. `robots.txt` is wide open but explicitly asks for a 10-second
> crawl delay from `ClaudeBot` — respect it.

## Installation

```bash
cd .agents/skills/arc-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings by technology/skill tag (`--query` required) |
| `detail` | Fetch full detail for a single job listing (aggregated listings only — see `../SKILL.md`) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Remote Flutter roles worldwide
bun run src/cli.ts search -q "flutter" --format table

# Posted in the last 7 days (client-side filter — see ../SKILL.md Notes)
bun run src/cli.ts search -q "react" --jobage 7 --format table

# Full detail for one job
bun run src/cli.ts detail ph3excboow --format plain
```

See `../SKILL.md` for the full flag reference and important quirks (category-tag search,
page-1-only, arc-native vs. aggregated detail), and `../url-reference.md` for the
underlying page-data documentation.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Technology/skill tag, e.g. `"flutter"` — not a free-text job title. |
| `--jobage` | | Only postings within N days (client-side). |
| `--page` | | Accepted, but only page 1 returns results. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
