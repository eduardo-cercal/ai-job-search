# geekhunter-cli

CLI for searching Brazil tech-recruiting job listings on **GeekHunter**'s public
`/pt/vagas` board.

**Data source**: `https://www.geekhunter.com/pt/vagas` (search) and each job's own
`/pt/<company-slug>/jobs/<job-slug>` page (detail, via its schema.org `JobPosting`
JSON-LD block).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

robots.txt explicitly permits crawling both paths this CLI uses (`Content-Signal:
search=yes` for `User-agent: *`), and its own comments name the individual job pages
as "the surface meant for discovery" in preference to the site's own (disallowed)
`/api/` routes. See `../url-reference.md` for the full read and `../SKILL.md` for the
robots.txt excerpt.

## Installation

```bash
cd .agents/skills/geekhunter-search/cli
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

# Senior mobile roles in São Paulo (on-site or hybrid)
bun run src/cli.ts search -q "mobile" -l "São Paulo, SP" --remote hybrid,onsite --experience-level senior --format table

# Full detail for one job
bun run src/cli.ts detail nava-technology-for-business-1/desenvolvedor-flutter-senior-4 --format plain
```

See `../SKILL.md` for the full flag reference and the robots.txt read.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Free text — matched against title, then skills, then description (GeekHunter's own documented relevance order). |
| `--location` | `-l` | Exact city name as written on the job, accents included. Verbatim match — only useful for on-site/hybrid postings. |
| `--remote` | | `remote` \| `remote-in-city` \| `hybrid` \| `onsite`/`on-site`. Comma-separated for "any of". |
| `--experience-level` | | `intern` \| `assistent` \| `entry` \| `mid` \| `senior` \| `coordinator` \| `manager` \| `director` \| `executive`. Comma-separated. |
| `--jobage` | | Posted within N days — **client-side filter**, no native param on this portal. |
| `--page` | | 1-indexed page (25 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

## A quirk worth knowing

`search` results only carry the company's **URL slug**, not its verified display
name (the payload never includes one). This CLI humanizes the slug as a best-effort
label (`nava-technology-for-business-1` → `Nava Technology For Business`), but that
slug is often the full legal entity name, not the brand name a candidate would
recognize (`bebee-tecnologia-da-informacao-ltda` → the real name is just `Bebee`).
Run `detail` on a promising result for the authoritative company name, which comes
straight from that posting's own `JobPosting` structured data.
