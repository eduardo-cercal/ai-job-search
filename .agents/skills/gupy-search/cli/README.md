# gupy-cli

CLI for searching Brazil tech-hiring job listings on **Gupy**'s public job-search
portal (`portal.gupy.io`).

**Data source**: `https://portal.gupy.io/job-search/...` (search) and each job's own
per-company `<subdomain>.gupy.io/job/<token>` page (detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

`portal.gupy.io/robots.txt` is fully open (`Disallow:` with no paths). A company's
own `<subdomain>.gupy.io` only disallows `/companies` and `/candidates` — never the
`/job/` detail pages this CLI fetches. See `../url-reference.md` and `../SKILL.md`.

## Installation

```bash
cd .agents/skills/gupy-search/cli
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
# Flutter roles, remote only
bun run src/cli.ts search -q "flutter" --remote remote --format table

# Any tech role in Curitiba, PR
bun run src/cli.ts search -q "desenvolvedor" -l "Curitiba" --state "Paraná" --format table

# Full detail for one job
bun run src/cli.ts detail grupoboticario/12393296 --format plain
```

See `../SKILL.md` for the full flag reference and the two portal limitations worth
knowing before you rely on this CLI.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Free text keyword search. |
| `--location` | `-l` | City name, sent as Gupy's own `city[]` filter (e.g. `"Curitiba"`). |
| `--state` | | Brazilian state name (e.g. `"Paraná"`). |
| `--remote` | | `remote` \| `hybrid`. Comma-separated for "any of". No confirmed on-site value — see SKILL.md. |
| `--jobage` | | Posted within N days — **client-side filter**, no native param confirmed. |
| `--page` | | Must be `1` — this portal's search page only ever serves page 1 (confirmed: `offset`/`page`/`limit` request params have no effect). |
| `--limit` | `-n` | Cap results emitted (client-side; the portal itself caps at 12 per query regardless). |
| `--format` | | `json` \| `table` \| `plain`. |

## Two quirks worth knowing

1. **No working pagination.** Every `offset`, `page`, and `limit` value tried during
   scaffolding returned the identical first-12-results page. `search --page 2` is
   rejected outright (`PAGINATION_UNSUPPORTED`) rather than silently returning
   mislabeled page-1 data.
2. **On-site filtering has no confirmed value.** `remote` and `hybrid` are confirmed
   working `workplaceType` values (tested against a live query with a small, verified
   result count); every on-site candidate tried (`on_site`, `onsite`, `on-site`,
   `presencial`, `in_person`, `office`) silently returned zero results rather than
   erroring — Gupy's own behavior for an unrecognized value, not confirmation of a
   near-miss. `--remote` therefore only accepts `remote`/`hybrid`.
