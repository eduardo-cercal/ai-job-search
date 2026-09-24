# Search Queries for Job Scraper

<!-- SETUP: Customize these queries based on your skills, target roles, and location -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

**Language scope:** write every query category in every language listed in your CLAUDE.md Languages table (typically 1-2, sometimes more). A posting requiring a language you have *not* declared, as a job condition, is excluded before scoring; a posting requiring a *higher level* than you declared in a language you *do* work in is flagged for your own judgment, not excluded — see `04-job-evaluation.md`'s Language Gate, the single source of truth for this rule. Translate each category's keywords rather than machine-translating word-for-word (e.g. "Frontend Developer" -> "Desarrollador Frontend", not a literal word-for-word translation) if you work in more than one language.

## Search Sites

Primary (your market's job boards - scaffold one with `/add-portal`):
- **catho.com.br** - Brazil's largest general job board - covered by `catho-search` CLI
- **linkedin.com/jobs** - LinkedIn job listings (filter: Brazil, remote); also covered by `linkedin-search` CLI
- **gupy.io** - major Brazil-market ATS/job board, widely used by tech employers - covered by `gupy-search` CLI (real server-side `term`/`city[]`/`state`/`workplaceType` filters, verified company display names, and full description/requirements/responsibilities in every result; no working pagination beyond the first 12 results per query, and no confirmed on-site `workplaceType` value - see the skill's own SKILL.md)
- **infojobs.com.br** - another major board for the Brazil market - covered by `infojobs-search` CLI
- **vagas.com.br** - another major general Brazil job board - covered by `vagas-search` CLI
- **programathor.com.br** - developer-focused Brazil job board, exposes tech-stack tags per listing - covered by `programathor-search` CLI (search only - no working detail page; no full-text search param, `--query` filters client-side by word against title + tags)
- **geekhunter.com** - Brazil tech-recruiting job board - covered by `geekhunter-search` CLI (real server-side `searchTerm`/`workModality`/`experienceLevel`/`cityName` filters, plus clean `JobPosting` structured data on each detail page; no native posting-age filter, so `--jobage` is a client-side filter)
- **arc.dev** - global remote-tech job board (tag-based, not full-text search - see `arc-search` CLI); useful for the international remote-USD roles your Location Filter marks acceptable
- **weworkremotely.com** - large global remote-jobs board - covered by `weworkremotely-search` CLI (uses the site's own RSS feed since ordinary pages are Cloudflare-blocked; no server-side search, `--query` filters client-side); another source for international remote-USD roles
- **trampos.co** - Brazil job board spanning communication, marketing, design, and tech - covered by `trampos-search` CLI (real server-side `tr`/`lc`/`ct[]`/`tp[]` filters and genuinely working pagination, a rarity among this repo's Brazil-market portals; general-audience board, so a niche technical query can legitimately return 0 results - broaden the term or filter `--category ti` instead)
- **himalayas.app** - international remote-tech job board - covered by `himalayas-search` CLI (same RSS-only pattern as `weworkremotely-search`: ordinary pages are Cloudflare-managed-challenge-blocked even with a browser UA, `--query` filters client-side, no pagination; a hard 20-item rolling window site-wide, so a niche query can legitimately return 0-1 results); another source for the international remote-USD roles your Location Filter marks acceptable, alongside `arc-search`/`weworkremotely-search`

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known target companies

## Query Categories

Queries are grouped by priority. Write **each category in every language from your Languages table** (see Language scope above). Combine each query with your location terms (e.g. your city, region, or metro area) where the site supports it.

**Organize by function, not job title.** The same underlying work carries different titles across companies and markets (a "Data Scientist" role at one employer may be posted as "Insights Analyst" or "Data Consultant" at another). Name each priority category after the function it covers, and list several plausible job titles as query variants within that category rather than betting an entire priority tier on one exact title string.

### Priority 1: Flutter / Mobile Development

These match your strongest and most desired career direction - staying Flutter-focused.

```
site:catho.com.br "Desenvolvedor Flutter" Brasil
site:catho.com.br "Desenvolvedor Mobile Sênior" Brasil
site:vagas.com.br "Desenvolvedor Flutter"
site:programathor.com.br "Flutter"
site:gupy.io "Flutter Developer"
site:linkedin.com/jobs "Desenvolvedor Flutter" Brasil
site:linkedin.com/jobs "Flutter Developer" Brazil
site:linkedin.com/jobs "Senior Mobile Developer" Brazil remote
site:arc.dev/remote-jobs/flutter
site:weworkremotely.com "Flutter"
```

### Priority 2: Flutter Architecture & Reliability Engineering

Deepening on what excites you: Clean Architecture, testing/CI-CD, Firebase reliability work - not a fixed industry vertical, since you're open to any sector that fits.

```
site:catho.com.br "Flutter" "Clean Architecture" Brasil
site:vagas.com.br "Flutter" "Clean Architecture"
site:linkedin.com/jobs "Flutter" "BLoC" OR "Riverpod" Brazil
site:linkedin.com/jobs "Flutter" "Firebase" "CI/CD" Brazil
site:gupy.io "Engenheiro de Software" Flutter
```

### Priority 3: Mobile Tech Lead / Flutter Tech Lead

Stretch roles leaning on your mentoring, code-review, and architecture-standard-setting experience.

```
site:catho.com.br "Flutter Tech Lead" OR "Mobile Tech Lead" Brasil
site:vagas.com.br "Flutter Tech Lead" OR "Mobile Tech Lead"
site:linkedin.com/jobs "Flutter Tech Lead" Brazil
site:linkedin.com/jobs "Mobile Tech Lead" Brazil
site:infojobs.com.br "Tech Lead" Flutter
```

### Priority 4: Broader Technical / Full-Stack

Wider net drawing on your PostgreSQL/C#/Node.js backend exposure (RJR Software, Intecso), for roles beyond pure Flutter.

```
site:catho.com.br "Desenvolvedor Full Stack" Flutter OR mobile Brasil
site:vagas.com.br "Desenvolvedor Full Stack" Flutter OR mobile
site:linkedin.com/jobs "Software Engineer" mobile Brazil remote
site:gupy.io "Desenvolvedor de Software" Flutter
```

## Location Filter

Ranked priority order - all tiers stay in scope, but rank/order results with this priority when presenting or searching:
1. **Remote, worldwide, any currency** - top priority. Brazil-based remote and international remote (any payment currency, not just USD) are tied at this tier - do not deprioritize an international remote role for paying in a non-USD currency.
2. **Curitiba, PR** - second priority (current base, on-site or hybrid)
3. **Any other Brazilian city** - third priority, Brazil-wide (open to relocation)
4. On-site roles outside Brazil requiring relocation abroad - flag for discussion (not explicitly ruled out, but not confirmed either)

When presenting `/scrape` or `/rank` results, break ties using this order (any remote role, wherever based or whatever it pays, outranks an equally-scored Curitiba on-site role, which outranks an equally-scored role in another Brazilian city, which outranks an equally-scored on-site role abroad).

## Language Filter

Your working languages and levels are in CLAUDE.md's Languages table. When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language you haven't declared at all is excluded; a posting requiring a higher level than you declared in a language you do work in is not excluded, flag it clearly instead (see `job-scraper/SKILL.md`'s Step 3 "Quick Fit Assessment" for how the flag surfaces in `/scrape` output). Postings simply *written* in a language you don't work in, that don't require it on the job, are fine.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries + custom focus-specific queries
