# catho-cli

CLI for searching jobs on **Catho** (catho.com.br), Brazil's largest general job board.

**Data source**: Catho's public search-results HTML and per-posting `schema.org/JobPosting` JSON-LD.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** robots.txt allows the paths this CLI uses, but no Terms-of-Use page
> could be located to confirm bulk-access rules. Keep volume low, don't use it commercially
> or for bulk data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/catho-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Flutter developer roles anywhere in Brazil
bun run src/cli.ts search -q "desenvolvedor flutter" --format table

# Same, narrowed to a city
bun run src/cli.ts search -q "desenvolvedor flutter" -l "Curitiba" --format table

# Posted in the last 7 days (client-side filter — see ../SKILL.md Notes)
bun run src/cli.ts search -q "desenvolvedor mobile" --jobage 7 --format table

# Full detail for one job
bun run src/cli.ts detail 37584918 --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note, and
`../url-reference.md` for the underlying endpoint/markup documentation.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Job title or keyword, e.g. `"desenvolvedor flutter"`. |
| `--location` | `-l` | Optional. Brazilian city or state abbreviation. |
| `--jobage` | | Only postings within N days (client-side). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
