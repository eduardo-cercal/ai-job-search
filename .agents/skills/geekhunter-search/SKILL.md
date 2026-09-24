---
name: geekhunter-search
version: 1.0.0
description: >
  Use this skill to search for tech job openings in Brazil on GeekHunter, a Brazil
  tech-recruiting job board. Invoke for developer/engineering/product/design roles,
  Flutter or mobile-developer positions, remote or on-site work in Brazil, or
  looking up a specific GeekHunter job posting. Trigger phrases: find a job, job
  search, search for jobs, vagas de tecnologia, vagas TI, vaga de desenvolvedor,
  vagas remotas, vagas Flutter, look up this job posting, GeekHunter.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/geekhunter-search/cli/src/cli.ts *)
---

# GeekHunter Search Skill

Search live tech-job listings on **GeekHunter** (`geekhunter.com`), a Brazil
tech-recruiting board. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`.

## Access basis

`robots.txt` explicitly welcomes this: its `Content-Signal` policy declares
`search=yes` for general crawlers, and its own comments name the exact pages this
skill fetches (`/pt/vagas` for search, `/pt/<company>/jobs/<slug>` for detail) as
"the surface meant for discovery" — in preference to the site's own `/api/` and
`/feeds/` routes, which robots.txt disallows and this skill never touches. No login
wall on either surface (confirmed live). Full excerpt and reasoning in
`url-reference.md`.

## When to use this skill

- Search for tech job openings in Brazil (developer, engineering, product, design,
  data — any role GeekHunter lists), remote or on-site
- Filter by workplace type (remote / remote-in-city / hybrid / on-site), city, or
  seniority level
- Get the full description, salary range, and deadline of a specific job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/geekhunter-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — free text, matched against title, then skills, then description (GeekHunter's own documented relevance order).
- `--location <text>` / `-l <text>` — exact city name as written on the job, accents included (e.g. `"São Paulo, SP"`). Verbatim match — only useful for on-site/hybrid postings that name a city.
- `--remote <mode>` — `remote`, `remote-in-city`, `hybrid`, or `onsite`/`on-site`. Comma-separated for "any of".
- `--experience-level <lv>` — `intern`, `assistent`, `entry`, `mid`, `senior`, `coordinator`, `manager`, `director`, `executive`. Comma-separated.
- `--jobage <days>` — posted within N days. **Client-side filter** — this portal has no native recency param.
- `--page <n>` — 1-indexed page (25 results/page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/geekhunter-search/cli/src/cli.ts detail <company-slug/job-slug|url> [--format json|plain]
```

`id` is the composite `<company-slug>/<job-slug>` from a `search` result's `id` field
(e.g. `nava-technology-for-business-1/desenvolvedor-flutter-senior-4`). A full
GeekHunter job URL also works. Returns the full description, salary, employment type,
experience requirement, skills, and deadline (`validThrough`) — plus the **verified**
company display name, which `search` results do not carry (see quirk below).

## Usage examples

```bash
# Flutter roles, remote only
bun run .agents/skills/geekhunter-search/cli/src/cli.ts search -q "flutter" --remote remote --format table

# Senior mobile roles in São Paulo, on-site or hybrid
bun run .agents/skills/geekhunter-search/cli/src/cli.ts search -q "mobile" -l "São Paulo, SP" --remote hybrid,onsite --experience-level senior --format table

# Any tech role, posted in the last 7 days (client-side filter)
bun run .agents/skills/geekhunter-search/cli/src/cli.ts search -q "desenvolvedor" --jobage 7 --format table

# Full detail for a specific job
bun run .agents/skills/geekhunter-search/cli/src/cli.ts detail nava-technology-for-business-1/desenvolvedor-flutter-senior-4 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## A quirk worth knowing

`search` results carry only the company's **URL slug**, never a verified display
name — the site's own search payload doesn't include one. This skill humanizes the
slug as a best-effort label (`nava-technology-for-business-1` →
`Nava Technology For Business`), but that slug is frequently the full legal entity
name, not the brand a candidate would recognize
(`bebee-tecnologia-da-informacao-ltda` → the real name is just `Bebee`). **Always run
`detail` before treating a company name from this portal as verified** — it comes
straight from that posting's own `JobPosting` structured data
(`hiringOrganization.name`), which every reviewer/drafter step in this repo's job-
application workflow already requires independent verification of regardless.

## Notes

- Data source: GeekHunter's public `/pt/vagas` search page and per-job `JobPosting`
  JSON-LD — no credentials required.
- Locale is hardcoded to Brazil's `/pt/` in this skill. GeekHunter also serves the
  same postings under `/en/` and `/es/`, not exposed here.
- Page size is fixed at 25 results per page.
- No native posting-age filter — `--jobage` is applied client-side against each
  result's `publishedAt`-derived date.
- The CLI retries 429/5xx with exponential backoff; a 404 returns no results rather
  than crashing.
