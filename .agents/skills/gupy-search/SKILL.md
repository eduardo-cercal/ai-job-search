---
name: gupy-search
version: 1.0.0
description: >
  Use this skill to search for tech job openings in Brazil on Gupy, Brazil's most
  widely used tech-hiring ATS/job board. Invoke for developer/engineering/product/
  design roles, Flutter or mobile-developer positions, remote or on-site work in
  Brazil, or looking up a specific Gupy job posting. Trigger phrases: find a job,
  job search, search for jobs, vagas de tecnologia, vagas TI, vaga de desenvolvedor,
  vagas remotas, vagas Flutter, look up this job posting, Gupy.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/gupy-search/cli/src/cli.ts *)
---

# Gupy Search Skill

Search live tech-job listings on **Gupy** (`gupy.io`), Brazil's most widely used
tech-hiring ATS/job board. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`.

## Access basis

`portal.gupy.io/robots.txt` is fully open (`Disallow:` with no paths). Each
company's own career-page subdomain (`<subdomain>.gupy.io`, where job detail pages
live) only disallows `/companies` and `/candidates` — never `/job/...`. No login
wall on either surface (confirmed live). Full excerpt in `url-reference.md`.

## When to use this skill

- Search for tech job openings in Brazil (developer, engineering, product, design,
  data — any role Gupy lists), remote or hybrid
- Filter by city, state, or workplace type (remote/hybrid)
- Get the full description, requirements, responsibilities, and deadline of a
  specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/gupy-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — free text keyword search.
- `--location <text>` / `-l <text>` — city name (e.g. `"Curitiba"`).
- `--state <text>` — Brazilian state name (e.g. `"Paraná"`).
- `--remote <mode>` — `remote` or `hybrid`. Comma-separated for "any of". **No
  confirmed on-site value** — see the quirk below.
- `--jobage <days>` — posted within N days. **Client-side filter** — no native
  recency param confirmed on this portal.
- `--page <n>` — **must be `1`.** This portal's search page only ever serves its
  first page of results — see the quirk below.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side; the portal
  itself never returns more than 12 per query regardless).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/gupy-search/cli/src/cli.ts detail <subdomain/jobId|url> [--format json|plain]
```

`id` is the composite `<subdomain>/<jobId>` from a `search` result's `id` field
(e.g. `grupoboticario/12393296`). A full Gupy job URL also works. Returns the full
description, a separate requirements section (`prerequisites`), responsibilities,
and the application deadline (`expiresAt`).

## Usage examples

```bash
# Flutter roles, remote only
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "flutter" --remote remote --format table

# Any tech role in Curitiba, PR
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "desenvolvedor" -l "Curitiba" --state "Paraná" --format table

# Posted in the last 7 days (client-side filter)
bun run .agents/skills/gupy-search/cli/src/cli.ts search -q "flutter" --jobage 7 --format table

# Full detail for a specific job
bun run .agents/skills/gupy-search/cli/src/cli.ts detail grupoboticario/12393296 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Two quirks worth knowing

1. **No working pagination.** Every combination of `offset`, `page`, and `limit`
   tried during scaffolding — against both the rendered search page and its
   underlying Next.js data route — returned the byte-identical first-12-results
   page. `search --page 2` is rejected outright (`PAGINATION_UNSUPPORTED`) rather
   than silently returning mislabeled page-1 data as if it were page 2. In practice
   this caps a single `/scrape` query at 12 results; run more specific queries
   (add a city, narrow the keyword) to stay within that ceiling rather than relying
   on paging through a broad one.
2. **No confirmed on-site filter value.** `remote` and `hybrid` are confirmed
   working (tested against a live query with a small, verifiable total: `remote`→10,
   `hybrid`→1, combined→11 of 13). Every on-site candidate tried (`on_site`,
   `onsite`, `on-site`, `presencial`, `in_person`, `office`) silently returned zero
   results — Gupy's own behavior for an unrecognized value, not confirmation of a
   near-miss — so `--remote` only accepts `remote`/`hybrid`. On-site postings still
   surface in an unfiltered or city/state-filtered search; they just can't be
   isolated by workplace type alone.

## Notes

- Data source: Gupy's public `/job-search` portal and each job's own per-company
  `__NEXT_DATA__` detail page — no credentials required.
- Unlike some other portal CLIs in this repo, **search results already carry a
  verified company display name** (`careerPageName`) and the full job description —
  no slug-guessing, no separate detail fetch strictly required just to identify the
  employer.
- The CLI retries 429/5xx with exponential backoff; a 404 returns no results rather
  than crashing.
