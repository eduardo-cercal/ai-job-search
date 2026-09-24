# GeekHunter URL Reference

Public, unauthenticated pages used by this skill. Brazil-only market (`/pt/` locale);
GeekHunter also serves `/en/` and `/es/` variants of the same postings, which this CLI
does not expose.

## Access basis (checked 2026-09-09)

`robots.txt` (`https://www.geekhunter.com/robots.txt`) declares a
[Content Signals Policy](https://contentsignals.org) block for `User-agent: *`
(reaching Googlebot, Bingbot, Claude-User, PerplexityBot, and other search/AI-answer
crawlers) that reads `Content-Signal: search=yes, ai-input=yes, ai-train=no`, and its
`Allow`/`Disallow` rules explicitly permit:

- `Allow: /pt/*/jobs`, `/pt/*/jobs/*` — individual job postings (what `detail` fetches)
- `Allow: /pt/vagas` — the job-search listing page (what `search` fetches)

It explicitly **disallows** `/api/` and `/feeds/`, with a comment stating why:

> Machine-readable partner ingestion endpoints — not pages, and not a surface for
> search indexing or AI training. The same jobs are crawlable as HTML at
> `/:locale/:company/jobs/:slug` (JobPosting structured data), which is the surface
> meant for discovery.

This CLI only ever fetches the two `Allow`-listed surfaces above and never touches
`/api/` or `/feeds/`, matching exactly what the site's own robots.txt directs a
crawler toward.

No login is required for either surface — confirmed live (search and detail both
return full content to an unauthenticated request).

## Search

```
GET https://www.geekhunter.com/pt/vagas?searchTerm=<q>&experienceLevel=<lv>&workModality=<mode>&cityName=<city>&page=<n>
```

Query params — documented by the page's own `schema.org` `SearchAction` (embedded as
JSON-LD in every page's `<head>`, under `WebSite.potentialAction`):

| Param | Meaning | Example |
|-------|---------|---------|
| `searchTerm` | Free text, matched against job title, then skills, then description, in that order of relevance (verbatim from the site's own `PropertyValueSpecification.description`) | `flutter` |
| `experienceLevel` | One or more of `intern, assistent, entry, mid, senior, coordinator, manager, director, executive`, comma-separated for "any of" | `senior` |
| `workModality` | One or more of `remote, remote-in-city, hybrid, on-site`, comma-separated. `remote-in-city` is remote work tied to a specific city and is **not** covered by plain `remote` | `remote` |
| `cityName` | City name exactly as written on the job, accents included (e.g. `São Paulo, SP`, not `Sao Paulo, SP`). Matched verbatim | `São Paulo, SP` |
| `page` | 1-indexed page number, confirmed live to change the result set (25 results/page, from the response's own `meta.perPage`) | `2` |

**No native posting-age filter exists** — `--jobage` in this CLI is a client-side
filter over each result's `publishedAt`-derived date.

### Response shape

The response is a full HTML page (Next.js App Router, server components). The actual
job data is **not** in a clean `<script type="application/json">` block — it is
embedded as a JSON-escaped string inside a React Server Components streaming chunk
(`self.__next_f.push([1, "...{\"data\":[...],\"meta\":{...}}..."])`). The CLI locates
the `{\"data\":[` anchor and does a balanced-brace scan (braces are never escaped by
JSON string encoding, so this is safe even while scanning through the escaped quotes),
then unescapes the extracted substring via `JSON.parse('"' + escaped + '"')` before a
second `JSON.parse` yields the real object — see `extractSearchBlob` in `helpers.ts`.

Each entry in `data[]` is a `PublicJob` object; the fields this CLI reads:

```
atsJob.jobSlug                              → job slug (URL path segment)
atsJob.company.slug                         → company slug (URL path segment; NOT the display name — see quirk below)
atsJob.publishedAt                          → epoch milliseconds, as a numeric string
atsJob.atsJobDetail.title                   → job title
atsJob.atsJobDetail.experienceLevel         → same vocabulary as the experienceLevel param
atsJob.atsJobDetail.workModality            → same vocabulary as the workModality param
atsJob.atsJobDetail.atsJobCities[].name     → city name(s), only populated for hybrid/on-site jobs
atsJob.atsJobDetail.atsJobSalaries[]        → {contractType, minSalary/minValue, maxSalary/maxValue, currency, currencyRef.symbol}
```

The parent object also carries `meta: {total, currentPage, lastPage, perPage}` — used
for this CLI's `meta.count`/`meta.page` output.

**Quirk — company slug is not the display name.** The payload never includes a
company's verified brand/display name, only its URL slug, which is frequently the
full legal entity name rather than the name a candidate would recognize (slug
`bebee-tecnologia-da-informacao-ltda` → real name `Bebee`, confirmed via that job's own
detail page). `search` results carry a best-effort humanized slug
(`humanizeSlug()` in `helpers.ts`) labeled as such in the CLI's own README/SKILL.md;
the authoritative name is only available via `detail`.

## Detail

```
GET https://www.geekhunter.com/pt/<company-slug>/jobs/<job-slug>
```

Returns a full HTML page carrying four `<script type="application/ld+json">` blocks:
`Organization`, `WebSite`, `BreadcrumbList`, and — the one this CLI reads —
`JobPosting`. Unlike the search page's data, this block is standard, unescaped
JSON-LD; no unescaping trick is needed.

Fields this CLI reads from the `JobPosting` block:

```
title
hiringOrganization.name              → the verified company display name
datePosted                           → ISO date
validThrough                         → ISO datetime; sliced to a date as the posting's deadline
jobLocationType                      → "TELECOMMUTE" for a remote posting
jobLocation[].address                → {addressLocality, addressRegion, addressCountry} for on-site/hybrid
applicantLocationRequirements[]      → country name(s) accepted for a remote posting
description                          → HTML; tags stripped, block-level breaks kept as newlines
skills                                → comma-separated string
employmentType                       → array, e.g. ["FULL_TIME"]
experienceRequirements.monthsOfExperience
baseSalary.value.{minValue,maxValue}, baseSalary.currency
```

## Notes

- No authentication required for either endpoint.
- Locale is hardcoded to `/pt/` in this CLI (Brazil market). GeekHunter also serves
  `/en/` and `/es/` variants of the same postings, not exposed here.
- The CLI backs off on 429/5xx with the same exponential-backoff-plus-jitter pattern
  as this repo's other portal CLIs; a 404 returns an empty response rather than
  throwing.
- `detail`'s `id` accepts either a full GeekHunter job URL (any locale) or the bare
  `<company-slug>/<job-slug>` composite that `search` returns as each result's `id`.
