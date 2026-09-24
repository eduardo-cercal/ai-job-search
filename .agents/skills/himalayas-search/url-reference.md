# Himalayas URL Reference

Public, unauthenticated feed on `himalayas.app`. Captured 2026-09-10.

> `robots.txt` (`https://himalayas.app/robots.txt`) is permissive on its face: a
> `User-Agent: *` block with `Allow: /` and a disallow list that only targets `/apply`
> and `?page=` pagination on several listing types (`/jobs?page=`, `/companies?page=`,
> `/talent?page=`, etc.). None of that touches this skill's usage — the feed path
> (`/jobs/rss`) is not in the disallow list at all. **In practice, however, robots.txt
> is not the operative access control here** — Cloudflare's bot-management layer
> returns an HTTP 403 managed-challenge page for ordinary HTML requests regardless of
> what robots.txt says, for any client it doesn't recognize as a real browser. See
> below.

## The Cloudflare-block / RSS-works split (confirmed live)

Every ordinary HTML page tried, with this skill's own honest UA
(`Mozilla/5.0 (compatible; himalayas-search-cli/1.0)`), returned HTTP 403 with the
title `Just a moment...` (Cloudflare's managed-challenge interstitial):
- `https://himalayas.app/jobs?searchQuery=flutter` (the site's own search page)
- `https://himalayas.app/companies/<slug>/jobs/<slug>` (an individual job page)

This was **re-tested with a full browser User-Agent string**
(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ... Chrome/128.0.0.0
Safari/537.36`) against the same search URL and still returned the identical 403
challenge page — confirming this is a genuine JS/TLS-fingerprint challenge, not a
simple User-Agent string check that header spoofing would defeat. (This skill does
not attempt that escalation regardless — the add-portal contract routes it through
`.claude/skills/job-application-assistant/09-web-research.md`'s robots.txt gate, not
a portal CLI's own default.)

The exact same honest UA returned real content on two static/documentation surfaces:
- `https://himalayas.app/rss` → 200, a plain info page ("Remote Jobs RSS/XML Feed |
  Himalayas") whose body text names the actual feed URL: `himalayas.app/jobs/rss`
- `https://himalayas.app/jobs/rss` → 200, the real feed itself
- `https://himalayas.app/sitemap-jobs1.xml.gz` (and `-jobs2`, `-jobs3`) → 200, static
  per-job-URL sitemaps (not used by this skill — the feed already carries full item
  data, so there is nothing to gain from also parsing sitemap URLs)

## Search

```
GET https://himalayas.app/jobs/rss
```

**No query parameter of any kind has any effect** — confirmed live by fetching the
feed with `?searchQuery=flutter`, `?q=flutter`, `?category=mobile-development`, and
`?limit=100` and finding **all four requests returned the same 20 items** as the
bare, unparammed URL. `--query` is implemented entirely client-side — see
`filterCardsByQuery` in `helpers.ts`.

**No pagination and a hard 20-item cap.** The feed always returns exactly 20
`<item>` elements regardless of any parameter tried, refreshed continuously (the
oldest and newest `pubDate` in one capture spanned under 45 minutes of postings on
a high-volume board) — this is a rolling "latest 20 site-wide" window, not a stable
archive. A niche technical query can easily return 0 client-side matches simply
because none of the current 20 happen to be a fit, which does not mean the search
mechanism failed.

Confirmed field set, via full item dumps:

| Field | Where | Notes |
|-------|-------|-------|
| title | `<title>`, CDATA-wrapped | Plain role title — unlike weworkremotely-search's feed, company name is **not** embedded in the title (see next row) |
| company | `<himalayasJobs:companyName>` | A dedicated custom-namespace field, not derived from the title |
| location | `<himalayasJobs:locationRestriction>` | Repeated 0+ times per item — a country name per occurrence (e.g. `Canada`, `United States`). **Absent entirely on most postings**, meaning "open to any location," not "unknown" — this skill joins present values with `", "` and represents true absence as `null` (rendered as "Worldwide" in `table`/`plain` output) rather than conflating the two |
| date | `<pubDate>` | RFC 2822 format, parsed via `Date.parse` |
| deadline | `<himalayasJobs:expiryDate>` | RFC 2822 format, present on most items observed — a genuine bonus field this repo's other RSS-based portal skill (weworkremotely-search) does not have (its `<expires>` tag exists but is empty on every item observed there) |
| url, id | `<link>` (identical to one of the two `<guid>` elements on every item observed) | `id` in this skill is the `<company-slug>/<job-slug>` pair extracted from the URL path `/companies/<company-slug>/jobs/<job-slug>` — a composite, unlike weworkremotely-search's single trailing slug, because Himalayas' path includes the company as a distinct segment |
| categories | `<category>`, CDATA-wrapped, repeated many times per item | Himalayas auto-generates many fine-grained tag variants per posting (e.g. a single sales-engineer role carried `Startup-Sales-Engineer`, `Founding-Sales-Executive`, `Sales-Engineer`, `Founding-Sales-Role`, `Principal-Sales-Engineer`, `Sales-Engineering`, `Sales` — seven tags for one job). This skill joins them all into one comma-separated string rather than picking one, since there is no signal for which tag is "the" category |
| description | `<content:encoded>`, CDATA-wrapped HTML | The full, rich job posting body (headings, lists, a compensation-range line at the end in prose) — **not** double-escaped the way weworkremotely-search's `<description>` is: CDATA already protects the raw HTML once, so a single tag-strip-and-entity-decode pass is correct here, not two |
| — | `<description>` (the plain, non-namespaced tag) | Present but only a short, truncated summary of `<content:encoded>` — not used, since the full version is available in the same item |
| — | `<himalayasJobs:timezoneRestriction>` | Repeated 0+ times, UTC-offset numbers (e.g. `-10`, `-9`, ... `14`) — present but not exposed by this skill; no filter parameter exists to act on it anyway |
| — | `<himalayasJobs:companyLogo>` | Present but empty on every item observed in this capture — not used |
| — | `<media:content url="" medium="image">` | Present with an empty `url` attribute on every item observed — not used |

## Detail — no separate page fetch

There is no reachable HTML detail page for this CLI (same 403 as above). Since the
feed already embeds each item's full `<content:encoded>` description, `detail <id>`
re-fetches `https://himalayas.app/jobs/rss` and looks up the item whose derived
`<company-slug>/<job-slug>` id matches the request, rather than attempting a second
HTTP request to a page this CLI cannot reach. This means `detail` only succeeds for
a job still present in the feed's rolling 20-item window — an older posting that has
scrolled out returns `NOT_FOUND`, which reflects this skill's one data source rather
than the posting's real status on the live site.

## Notes

- No authentication required for the feed.
- The 20-item cap is firm and confirmed — unlike weworkremotely-search's combined
  feed (~90 items across ~10 per-category sub-feeds this skill could in principle
  call separately), Himalayas exposes only the one site-wide feed with no
  category-specific variant discovered.
- Keep volume low as a general courtesy, and because this is a Cloudflare-fronted site.
