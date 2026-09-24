---
name: trampos-search
version: 1.0.0
description: >
  Use this skill to search for job openings in Brazil on trampos.co, a Brazil job
  board focused on communication, marketing, design, and technology roles. Invoke
  for developer/engineering/tech, mobile/Flutter, marketing, design, or content
  roles in Brazil, remote or on-site. Trigger phrases: find a job, job search,
  search for jobs, vagas, vaga de desenvolvedor, vagas de tecnologia, vagas remotas,
  vagas Flutter, home office, look up this job posting, trampos.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/trampos-search/cli/src/cli.ts *)
---

# trampos.co Search Skill

Search live job listings on **trampos.co**, a Brazil job board focused on
communication, marketing, design, and technology roles. No authentication, no API
key, and **zero runtime dependencies** — it runs with just `bun`.

## Access basis

`robots.txt` only disallows `/admin/` — everything else, including the JSON API
this skill uses (`/api/v2/opportunities`), is unrestricted. No login wall
(confirmed live). The site's own server only renders a static, query-independent
"featured jobs" fallback for non-JS clients; this skill instead talks to the same
API endpoint the site's own Ember.js frontend calls, discovered by reading that
app's JS bundle rather than guessed — full trail in `url-reference.md`.

## When to use this skill

- Search for job openings in Brazil across communication, marketing, design, and
  technology (including mobile/Flutter development)
- Filter by city, category (e.g. IT), or opportunity type (full-time, internship,
  talent pool)
- Get the full description, requirements, nice-to-haves, and perks of a specific
  job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/trampos-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — free text keyword search.
- `--location <text>` / `-l <text>` — city name (e.g. `"Curitiba"`).
- `--category <slug>` — category slug(s), comma-separated. Known examples: `ti`
  (Tecnologia da Informação), `design`, `marketing`, `criacao`, `midia`,
  `comercial`, `rh`, `administrativo`, `cs`. An unrecognized slug returns zero
  results rather than erroring — not validated client-side, since the category
  list is larger and more dynamic than `--type`'s.
- `--type <slug>` — `emprego` (full-time), `estagio` (internship), or
  `banco-talentos` (talent pool). Comma-separated.
- `--jobage <days>` — posted within N days. **Client-side filter** — no native
  recency param found in the site's own app bundle.
- `--page <n>` — 1-indexed page (12 results/page). **Confirmed working** — a real
  advantage over some other Brazil-market portals in this repo whose search only
  ever serves page 1.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/trampos-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the bare numeric id from a `search` result's `id` field (e.g. `774366`). A
full trampos.co job URL also works. Returns the full description, a separate
requirements section (`prerequisite`), nice-to-haves (`desirable`), and perks.

## Usage examples

```bash
# IT-category roles matching "desenvolvedor"
bun run .agents/skills/trampos-search/cli/src/cli.ts search -q "desenvolvedor" --category ti --format table

# Mobile roles in São Paulo, full-time only
bun run .agents/skills/trampos-search/cli/src/cli.ts search -q "mobile" -l "São Paulo" --type emprego --format table

# Any tech role, posted in the last 7 days (client-side filter)
bun run .agents/skills/trampos-search/cli/src/cli.ts search --category ti --jobage 7 --format table

# Full detail for a specific job
bun run .agents/skills/trampos-search/cli/src/cli.ts detail 774366 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- Data source: trampos.co's public `/api/v2/opportunities` JSON API — the same
  endpoint the site's own frontend uses, not a scraped HTML page. No credentials
  required.
- This is a **general Brazil job board** spanning communication, marketing, design,
  and tech — not tech-specialized like `geekhunter-search` or `programathor-search`.
  A niche technical query (e.g. `"flutter"`) may legitimately return 0 results even
  though the API is working correctly; broaden to `"desenvolvedor"` or filter by
  `--category ti` instead.
- Pagination is genuinely confirmed working — `page=2` returns a real, different
  result set (verified live, not assumed).
- Search results do not carry a `home_office` flag (only `hybrid`) or a direct
  detail URL — this CLI constructs the canonical URL from the bare id
  (`https://www.trampos.co/oportunidades/<id>`), confirmed live to resolve
  identically to the fully-slugged URL.
- The CLI retries 429/5xx with exponential backoff; a 404 returns no results rather
  than crashing.
