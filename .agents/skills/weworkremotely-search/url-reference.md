# We Work Remotely URL Reference

Public, unauthenticated feed on `weworkremotely.com`. Captured 2026-09-04.

> `robots.txt` (`https://weworkremotely.com/robots.txt`) is permissive: a single
> `User-agent: *` block `Allow: /` with a short disallow list (`/admin/`, `/account/`,
> `/job-seekers/account/`, `/job-seekers/profile/`, `/manage-company/`, two `edit?token=`/
> `cancel?token=` patterns). None of that touches this skill's usage. **In practice,
> however, robots.txt is not the operative access control here** — Cloudflare's bot
> management layer returns an HTTP 403 JS-challenge page for ordinary HTML requests
> regardless of what robots.txt says, for any UA it doesn't recognize as a real browser.
> See below.

## The Cloudflare-block / RSS-works split (confirmed live)

Every ordinary HTML page tried, with this skill's own honest UA
(`Mozilla/5.0 (compatible; weworkremotely-search-cli/1.0)`), returned HTTP 403 with the
title `Just a moment...` (Cloudflare's JS challenge interstitial):
- `https://weworkremotely.com/` (homepage)
- `https://weworkremotely.com/remote-jobs/search?term=flutter` (the site's own search page)
- `https://weworkremotely.com/remote-jobs/<any-slug>` (an individual job page)
- `https://weworkremotely.com/sitemap.xml` (referenced in robots.txt — even this XML file is challenge-gated)

The exact same UA against a `.rss` path returned real content immediately:
- `https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss` → 200
- `https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss` → 200
- `https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss` → 200
- `https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss` → 200
- `https://weworkremotely.com/remote-jobs.rss` (the **combined**, all-categories feed) → 200

`https://weworkremotely.com/categories/remote-mobile-programming-jobs.rss` returned 403
on two separate attempts — this is **not** evidence that category's feed is
challenge-gated differently from the others; it is evidence that **no such category
exists**. The combined feed's own `<category>` values (see below) list ten categories,
none of them mobile-specific — "React Native"/"Flutter" postings live under
"Full-Stack Programming" instead. Guessing a nonexistent category slug apparently routes
into the same challenge page a bot gets everywhere else, rather than a clean 404.

This skill deliberately does **not** attempt to escalate past the 403 with browser-like
headers — the add-portal contract routes that decision through
`.claude/skills/job-application-assistant/09-web-research.md`'s robots.txt gate, not a
portal CLI's own default. Since the `.rss` feed is itself a legitimate, publicly linked
data source (not a workaround), this skill just uses it directly.

## Search — combined feed

```
GET https://weworkremotely.com/remote-jobs.rss
```

No query parameter of any kind — confirmed by there being no such parameter documented
or discoverable on the feed (unlike some HTML-scraped portals in this repo where guessed
param names were tested and found to be silent no-ops, there is nothing here to even
guess at: RSS feeds are static per-URL resources). `--query` is implemented entirely
client-side — see `filterCardsByQuery` in `helpers.ts`.

**No real pagination.** `?page=2` was appended to the combined-feed URL and fetched
back-to-back against the unparammed URL (to rule out the feed's own content simply
changing between two separate requests made minutes apart, which is what an earlier,
looser comparison had actually been measuring) — both requests returned **byte-identical**
`<title>` sequences. `page` is a confirmed no-op on this feed.

Returns 25-90 `<item>` elements (a combined feed with ~10 items from each of ~10
categories, refreshed continuously as new jobs post) with this field set, confirmed
live via full item dumps:

| Field | Where | Notes |
|-------|-------|-------|
| title | `<title>Company: Role</title>` | **Always** contains `": "` in every item observed across the combined feed — split on the *first* occurrence only, since the role portion can itself contain further punctuation (e.g. "Track it Forward: Lead Developer — Rebuild, Modernize, & Scale (Social Good SaaS, Remote)") |
| company | (derived from title, see above) | `null` if no `": "` separator is present (not observed live, but defensively handled) |
| location | `<region>` | Overwhelmingly `"Anywhere in the World"` (87 of 90 items in one capture); a handful of specific values like `"USA Only"` or a city name appear |
| date | `<pubDate>` | RFC 2822 format (`"Fri, 04 Sep 2026 12:00:00 +0000"`), parsed via `Date.parse` — no relative-date guessing needed, this is a real absolute timestamp |
| url, id | `<link>` (identical to `<guid>` on every item observed) | `id` is the trailing URL slug, e.g. `lemon-io-senior-react-native-developer-1` |
| category | `<category>` | WWR's own job-function category. Ten distinct values seen in one capture: Full-Stack Programming, Front-End Programming, Back-End Programming, DevOps and Sysadmin, Design, Product, Sales and Marketing, Customer Support, Management and Finance, All Other Remote |
| skills | `<skills>` | Free-text, comma-separated (e.g. `"Node.js, React, Engineer, Developer, Mobile, React Native, and Mobile Development"`) — a genuinely useful field this repo's other portal skills don't have an equivalent of, folded into the client-side query filter |
| employmentType | `<type>` | e.g. `"Full-Time"` |
| description | `<description>` | Full job posting body, **double-escaped**: the RSS/XML layer escapes the description's own HTML (`&lt;p&gt;`, `&lt;strong&gt;`, etc.), and that HTML in turn contains ordinary HTML entities (`&amp;nbsp;`, `&amp;amp;`) that only resolve after the outer escaping is undone — `cleanDescription()` in `helpers.ts` decodes twice, stripping tags in between |
| — | `<country>`, `<state>` | Present but inconsistent/messy (e.g. one item had `region="Anywhere in the World"` yet `state="Nouvelle-Aquitaine"`) — not used by this skill; `region` is the cleaner, more consistent location signal |
| — | `<expires>` | Present on every item's tag list but **empty on every item observed** (confirmed across all 90 items in one capture) — no real deadline data here, not used |
| — | `<media:content url="...">` | Company logo image URL — not used |

**Why description matters for `--query`:** a live "Lemon.io: Senior React Native
Developer" posting has neither "Flutter" in its title nor in its `skills` field — only
its description mentions Flutter, as a nearby/alternative technology to React Native.
Matching only against title/category/skills would silently miss this listing for a
`-q "flutter"` search; the client-side filter in `helpers.ts` therefore includes
description text in its match haystack.

## Detail — no separate page fetch

There is no reachable HTML detail page for this CLI (same 403 as above). Since the
combined feed already embeds each item's full `description`, `detail <id>` re-fetches
`https://weworkremotely.com/remote-jobs.rss` and looks up the item whose `link` ends in
the requested slug, rather than attempting a second HTTP request to a page this CLI
cannot reach. This means `detail` only succeeds for a job still present in the feed's
rolling window (the latest ~10 per category) — an older posting that has scrolled out
returns `NOT_FOUND`, which reflects this skill's one data source rather than the
posting's real status on the live site.

## Notes

- No authentication required for the feed.
- Per-category feeds also exist and work individually (confirmed: full-stack, front-end,
  back-end, devops) but this skill deliberately uses only the combined `remote-jobs.rss`
  feed as its single data source — it already aggregates every category in one fetch, so
  there is no coverage gained by also calling the per-category feeds, only extra requests.
- Keep volume low as a general courtesy, and because this is a Cloudflare-fronted site.
