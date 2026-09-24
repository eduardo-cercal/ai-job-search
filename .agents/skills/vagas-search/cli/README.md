# vagas-cli

CLI for searching jobs on **Vagas.com** (vagas.com.br), a major Brazilian job board.

**Data source**: Vagas.com's public search-results HTML and per-posting detail-page HTML (no JobPosting JSON-LD is present — confirmed live).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** robots.txt's default `User-Agent: *` block allows the search
> (`/vagas-de-<slug>`) and detail (`/vagas/v<id>/...`) paths this CLI uses (it only
> disallows `/auth/`, `/move_to`, `/servicos/`, `/v1/`, `/api/`, `/social/`, `/users/`,
> `/token/`, `/vagas/pesquisas`, `/suporte`, `/mapa-de-carreiras/cargo/`, `/suporte-flix`).
> A dedicated Terms-of-Use page could not be located to confirm bulk-access rules. Keep
> volume low, don't use it commercially or for bulk data collection, and run it on your
> own responsibility.

## Installation

```bash
cd .agents/skills/vagas-search/cli
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

# Same, narrowed to a state/city via Vagas.com's own location facet
bun run src/cli.ts search -q "analista" -l "São Paulo" --format table

# Posted in the last 7 days (client-side filter — see ../SKILL.md Notes)
bun run src/cli.ts search -q "desenvolvedor" --jobage 7 --format table

# Full detail for one job
bun run src/cli.ts detail 2824782 --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note, and
`../url-reference.md` for the underlying endpoint/markup documentation.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Job title or keyword, e.g. `"desenvolvedor flutter"`. |
| `--location` | `-l` | Optional. City or state name — passed through to Vagas.com's `e[]` location facet. |
| `--jobage` | | Only postings within N days (client-side). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
