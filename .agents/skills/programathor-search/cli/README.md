# programathor-cli

CLI for searching jobs on **ProgramaThor** (programathor.com.br), a developer-focused Brazilian job board.

**Data source**: ProgramaThor's public job-listing page HTML (`/jobs`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Search-only.** This CLI ships without a working `detail` command — every
> `/jobs/<id>-<slug>` detail page returned a genuine site-side HTTP 500 at the time this
> skill was built (confirmed live across multiple job ids, a browser-like User-Agent, and
> a trailing-slash/.json URL variant — this is ProgramaThor's own bug, not a
> bot-detection response or a gap in this CLI's parsing). Running `detail` returns a
> clear `DETAIL_UNSUPPORTED` error explaining this rather than silently failing.
>
> Separately, ProgramaThor has **no server-side full-text search parameter** —
> `q=`/`search=`/`query=`/`keyword=` were all probed live and confirmed to be silently
> ignored no-ops (byte-identical result sets). `--query` is instead a **client-side**
> filter over each fetched card's own title and tech-stack tags.

## Installation

```bash
cd .agents/skills/programathor-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required, filtered client-side) |
| `detail` | Always fails with `DETAIL_UNSUPPORTED` — see the note above |

`search` accepts `--format json|table|plain` (default `json`).
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Flutter roles anywhere (client-side filtered from the current /jobs listing)
bun run src/cli.ts search -q "flutter" --format table

# Same, narrowed to Curitiba via ProgramaThor's own place filter
bun run src/cli.ts search -q "flutter" -l "Curitiba" --format table

# Remote React roles, page 2 of the listing
bun run src/cli.ts search -q "react" -l "Remoto" --page 2 --format table
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the
underlying endpoint/markup documentation, including the live evidence for both the
missing search parameter and the broken detail pages.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Matched client-side against title + tech-stack tags. |
| `--location` | `-l` | Optional. City name or "Remoto" — maps to ProgramaThor's `place` filter. |
| `--page` | | 1-indexed page. `--query` filters only within this one fetched page. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

No `--jobage` flag: the listing carries no posting-date field at all, so there is
nothing to filter by age. The flag is rejected (`UNKNOWN_FLAG`) rather than silently
accepted and ignored.
