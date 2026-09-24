# Gupy URL Reference

Public, unauthenticated pages used by this skill.

## Access basis (checked 2026-09-09)

`https://portal.gupy.io/robots.txt` is fully open:

```
User-agent: *
Disallow:
```

Each company's own career-page subdomain (`<subdomain>.gupy.io`, where `detail`
fetches its job pages) carries its own `robots.txt`, e.g.
`https://grupoboticario.gupy.io/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /companies
Disallow: /candidates
```

`/job/<token>` pages are never disallowed. This CLI never touches `/companies` or
`/candidates`. No login wall on either the search portal or a job detail page —
confirmed live.

## Search

```
GET https://portal.gupy.io/job-search/<param1>=<value1>&<param2>=<value2>...
```

Note the unusual shape: filters are a single **path segment** joined with `&`
(Next.js's `[pid]` dynamic-route catch-all), not a real `?query=string`. Confirmed
working params:

| Param | Meaning | Example |
|-------|---------|---------|
| `term` | Free-text keyword search | `flutter` |
| `city[]` | City name (sent percent-encoded as `city%5B%5D`) | `Curitiba` |
| `state` | Brazilian state name | `Paraná` |
| `workplaceType` | `remote` or `hybrid`, comma-separated for "any of" (confirmed via a query with a small, verifiable total: `remote`→10, `hybrid`→1, combined→11, out of 13). **No on-site value confirmed** — `on_site`, `onsite`, `on-site`, `presencial`, `in_person`, and `office` were all tried and each silently returned 0 results (matching Gupy's behavior for a value it doesn't recognize, not a near-miss) | `remote` |

**No native pagination.** `offset`, `page`, `pageNumber`, and `limit` were all tried,
both against the rendered HTML page and against the equivalent Next.js data route
(`/_next/data/<buildId>/job-search/<pid>.json?pid=<pid>`, confirmed to exist via the
page's own embedded `buildId`/`page` fields). All returned the byte-identical
first-12-results page regardless of the value passed — `offset=12` echoed back into
`searchFilters` but the returned `data` array and `pagination.offset` were unchanged
from `offset=0`. This CLI treats it as a confirmed portal limitation: `--page`
rejects anything but `1` rather than silently mislabeling page-1 data as page N.

### Response shape

The response is a full HTML page (Next.js **Pages Router** — contrast with
geekhunter-search's App Router RSC streaming). The job data lives in a plain,
standard `<script id="__NEXT_DATA__" type="application/json">` block — one
`JSON.parse` away, no escaping trick needed:

```
props.pageProps.initialJobList.data[]      → array of job records
props.pageProps.initialJobList.pagination  → {total, limit, offset} (offset/limit here are always 0/12, see above)
props.pageProps.params                     → the request's own params, echoed back (debugging aid, not consumed by this CLI)
```

Each job record already carries everything `search` needs — no separate detail
fetch required to get a usable result:

```
id                    → numeric job id
name                  → job title
careerPageName        → the VERIFIED company display name (unlike geekhunter-search,
                         no slug-guessing needed - this field is authoritative)
description           → full HTML description, already present in the search listing
publishedDate          → ISO datetime
applicationDeadline    → ISO datetime (nullable)
workplaceType          → "remote" | "hybrid" | absent
city, state            → set for hybrid/on-site postings, empty string for remote
jobUrl                 → the full, ready-to-use detail-page URL (includes the
                         company's subdomain + an opaque base64 token)
```

## Detail

```
GET https://<company-subdomain>.gupy.io/job/<token>
```

`<token>` is a base64 encoding of `{"jobId":<id>,"source":"gupy_portal"}` — verified
by decoding a real token and reconstructing an identical one from its `id`. This CLI
exploits that: `detail`'s `<subdomain>/<jobId>` composite id re-encodes the token
itself rather than requiring the caller to carry the ugly opaque string around.

The detail page also embeds a `__NEXT_DATA__` block:

```
props.pageProps.job.name
props.pageProps.job.careerPage.name        → verified company display name (matches
                                              careerPageName from the search listing)
props.pageProps.job.description             → HTML
props.pageProps.job.prerequisites           → HTML, a separate "requirements" section
                                              not present in the search listing
props.pageProps.job.responsibilities        → HTML, ditto
props.pageProps.job.workplaceType
props.pageProps.job.addressCity, addressState, addressCountry
props.pageProps.job.publishedAt             → ISO datetime
props.pageProps.job.expiresAt               → plain date (the application deadline)
props.pageProps.job.jobSteps                → the hiring-process stages (not exposed
                                              by this CLI, but present if needed later)
```

## Notes

- No authentication required for either endpoint.
- Two confirmed limitations, both documented loudly rather than silently worked
  around: no working pagination (search caps at 12 results, page 1 only), and no
  confirmed on-site `workplaceType` value.
- The CLI backs off on 429/5xx with the same exponential-backoff-plus-jitter pattern
  as this repo's other portal CLIs; a 404 returns no results rather than crashing.
- `detail`'s `id` accepts either a full Gupy job URL (any company subdomain) or the
  bare `<subdomain>/<jobId>` composite that `search` returns as each result's `id`.
