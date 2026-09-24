# trampos-cli

CLI for searching Brazil communication/marketing/tech job listings on
**trampos.co**'s public JSON API.

**Data source**: `https://www.trampos.co/api/v2/opportunities` (search and detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

trampos.co's own server only renders a static "featured jobs" fallback (a
`<noscript>` block, unrelated to any search query) — real search results are
fetched client-side by the site's Ember.js app from this same JSON API, discovered
by reading that app's bundle. `robots.txt` only disallows `/admin/`; the API path
is not blocked. See `../url-reference.md` and `../SKILL.md`.

## Installation

```bash
cd .agents/skills/trampos-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts
`--format json|plain`. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# IT-category roles matching "desenvolvedor"
bun run src/cli.ts search -q "desenvolvedor" --category ti --format table

# Mobile roles in São Paulo, full-time only
bun run src/cli.ts search -q "mobile" -l "São Paulo" --type emprego --format table

# Full detail for one job
bun run src/cli.ts detail 774366 --format plain
```

See `../SKILL.md` for the full flag reference.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Free text keyword search. |
| `--location` | `-l` | City name (e.g. `"Curitiba"`). |
| `--category` | | Category slug(s), comma-separated. Known examples: `ti`, `design`, `marketing`, `criacao`, `midia`, `comercial`, `rh`, `administrativo`, `cs`. An unrecognized slug returns zero results rather than erroring (not validated client-side — the category list is larger/more dynamic than `--type`'s). |
| `--type` | | `emprego` \| `estagio` \| `banco-talentos`. Comma-separated. |
| `--jobage` | | Posted within N days — **client-side filter**, no native param confirmed. |
| `--page` | | 1-indexed page (12 results/page). **Confirmed working** — unlike some other portal CLIs in this repo, pagination here is real. |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |
