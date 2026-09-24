# Arc.dev URL Reference

Public, unauthenticated pages on `arc.dev`. Captured 2026-09-04. Arc is a Next.js app
that server-renders each page's data straight into a `<script id="__NEXT_DATA__">`
JSON blob — no separate API call needed, just fetch the page and parse that blob.

> `robots.txt` (`https://arc.dev/robots.txt`) is wide open: `Allow: /` for `User-agent: *`,
> with an explicit `User-agent: ClaudeBot` entry carrying only a `Crawl-Delay: 10` (no
> disallow). No personal-use warning needed on access grounds — keep volume low anyway,
> matching every other portal skill in this repo, and respect the 10-second crawl delay
> Arc asked for.

## Search

```
GET https://arc.dev/remote-jobs/<tag-slug>
```

**This is category/tag browsing, not free-text keyword search.** Arc's job board is
organized around technology/skill tags (`flutter`, `react`, `python`, `kotlin`, `android`,
`swift`, `javascript`, ...), one static page per tag. There is no `?q=` or `?search=`
parameter that does a full-text title search across all postings.

Three confirmed behaviors around slug matching:
- An exact known tag (`flutter`) resolves directly (200).
- A near-miss with Arc's own synonym/redirect table (`flutter-developer`) 308-redirects
  to the canonical tag page (`flutter`) — fine, same data.
- **An unrecognized slug** (`mobile-developer`, or outright nonsense like
  `zzzznonexistentskillxyz`) also 308-redirects, but to the **generic, unfiltered**
  `/remote-jobs` firehose (thousands of jobs across every category) — not a 404, not an
  empty page. Silently treating that firehose as "the search results" would be exactly
  the "discarded filter" failure mode the portal-skill contract warns about, so this is
  the load-bearing check in `helpers.ts`.

## Result data (embedded in the page, page 1 only)

Fetch the category URL and parse `__NEXT_DATA__.props.pageProps`:

```json
{
  "arcJobs": [ /* Arc's own listings, applied through Arc's own flow */ ],
  "externalJobs": [ /* aggregated from other job boards, e.g. LinkedIn */ ],
  "totalExternalJobCount": 34,
  "categoryUrlString": "flutter"
}
```

**`categoryUrlString` is the discriminator described above**: present and equal to the
requested tag on a real category page, `null`/absent on the generic fallback page. Check
it before trusting `arcJobs`/`externalJobs` at all.

Each entry in both arrays (arc-native and external) shares the same core shape:

| Field | Notes |
|-------|-------|
| `randomKey` | the job id, a short lowercase alphanumeric string (e.g. `ph3excboow`) — **no hyphens**, which is what makes it safe to always be "the last `-`-delimited segment" of a job's URL slug |
| `title` | plain text |
| `company.name` | can be `null` even for a real listing — an Arc-native job can hide the client company's identity until application (confirmed live: `company` was `{"randomKey": null}`, no `name` key at all, for two genuine listings) |
| `urlString` | the title-slug half of the detail URL |
| `postedAt` | Unix **seconds** timestamp |
| `requiredCountries` | array of ISO country codes the candidate must be located in; an **empty array means worldwide**, not "no data" |

There is no explicit "location" or "city" field — `requiredCountries` is the only
location-like signal, since this is a remote-only board.

**Only page 1 is reachable.** `totalExternalJobCount` (e.g. 34) is often larger than
`externalJobs.length` (capped around 30), meaning more results exist, but no working
pagination parameter was found: `?page=2` triggers Arc's own canonicalizing redirect
back to the bare category URL (stripped), and other guessed param names
(`p`, `offset`, `skip`, `pageNum`) return 200 but return byte-identical page-1 data —
none actually advance the result set. No client-side "load more" trigger or its backing
endpoint was found in the static HTML either. Treated as unsupported; see `SKILL.md` Notes.

**No date/recency filter parameter found.** The CLI filters `--jobage` client-side using
each result's own `postedAt`.

## Detail

```
GET https://arc.dev/remote-jobs/j/<any-slug>-<id>
```

Confirmed live: the title-slug prefix is cosmetic — Arc 308-redirects to the *correct*
canonical URL purely from the trailing id (`.../j/wrong-slug-here-ph3excboow` redirected
to `.../j/eltropy-senior-mobile-developer-remote-ph3excboow`, and a minimal one-character
placeholder slug, `x-ph3excboow`, worked identically). The CLI exploits this and always
requests `.../j/job-<id>`.

Parse `__NEXT_DATA__.props.pageProps.job`:

```json
{
  "title": "...",
  "companyName": "...",
  "urlString": "...",
  "postedAt": 1788349735,
  "requiredCountries": ["IN"],
  "contractType": "permanent",
  "description": "<strong>...</strong>\n\nplain paragraphs with literal newlines...\n\n*   bullet\n*   bullet",
  "url": "https://in.linkedin.com/jobs/view/..."   // present only on aggregated ("external") jobs — the original posting's own URL
}
```

Two important shapes:

- **`description` uses literal `\n`/`\n\n` for paragraph and list breaks already** (reads
  like Markdown run through a light HTML pass, with only `<strong>` for emphasis and
  literal `*   ` bullet markers left as plain text). Strip tags **without** collapsing
  whitespace/newlines the way a blanket `\s+` → `" "` normalize would — that would flatten
  the whole thing into one unreadable line. `cleanDescription()` in `helpers.ts` only
  removes tags and squeezes 3+ blank lines down to one blank line, leaving the paragraph
  and bullet structure intact.
- **`pageProps.job` is only ever populated for aggregated ("external") jobs.** Every
  Arc-native listing's own `/remote-jobs/j/...` URL tested redirected instead to the
  generic `/remote-jobs` listing page (`pageProps` there has no `job` key at all) — most
  likely gated behind Arc's own account/application flow rather than viewable as a plain
  page. Treat `job` being absent as "detail not available for this source", not a parse
  failure; the CLI reports this distinctly (`DETAIL_UNAVAILABLE`) rather than a generic error.

## Notes

- No authentication required for anything above.
- Keep volume low and respect the 10-second `Crawl-Delay` `robots.txt` sets for `ClaudeBot`.
