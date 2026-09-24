# ProgramaThor URL Reference

Public, unauthenticated pages on `programathor.com.br`. Captured 2026-09-04.

> `robots.txt` (`https://programathor.com.br/robots.txt`) is minimal: a single
> `User-agent: *` block disallowing only `/admin/`, `/user/`, `/users/`, `/company/`, plus
> a `Sitemap:` line. None of this skill's `search` (`/jobs`) usage touches those paths. No
> dedicated Terms-of-Use restriction on automated access was found.

## Search

```
GET https://programathor.com.br/jobs[?place=<location>][&page=<n>]
```

**No full-text search parameter exists.** The rendered `/jobs` page has exactly one
free-text `<input>` on it (`name="place"`, labeled "Cidade da vaga" — a location filter,
not a keyword search). Four plausible undocumented parameter names were probed live
anyway (`q=`, `search=`, `query=`, `keyword=`) — each returned a response byte-identical
to the unfiltered `/jobs` baseline except for a per-request CSRF token, an obfuscated
inline-script `type` attribute nonce, and the `og:url` meta tag reflecting whichever param
was passed. All four are confirmed silently-ignored no-ops. **Do not add a query
parameter to the URL** — filtering by keyword has to happen client-side over the fetched
cards (see `filterCardsByQuery` in `helpers.ts`).

- `place=<location text>`: confirmed live as a **real filter**. A real city name
  (`place=Curitiba`) narrowed every returned card's location field to Curitiba-area
  results; the literal value `place=Remoto` narrowed every card's location field to
  exactly `"Remoto"`, identically to the site's own `?remoto=true` toggle link — so
  `place` alone covers both a real city and the remote case, and this skill's
  `--location` flag maps directly to it.
- `page=<n>`: confirmed live as **real pagination** — `page=2` returned 15 job ids with
  **zero overlap** against the unparammed page-1 fetch — even though no pagination link
  appears anywhere in the rendered HTML (the site apparently relies on a "load more" UI
  interaction that isn't present in the static markup this skill parses).
- Other real, working filter params found in the page's own filter-sidebar links (not
  wired into this CLI, listed for a future maintainer): `remoto=true`,
  `accepts_outer_candidates=true`, `company_type=<text>`, `contract_type=<text>`,
  `expertise=<Júnior|Pleno|Sênior>` (seniority level, despite the generic-sounding name).

Returns full HTML. Each result is one `<div class="cell-list ">` element containing:

| Field | Where |
|-------|-------|
| id, url | `<a href="/jobs/<id>-<slug>">` wrapping the whole card — id is the leading digits of the slug |
| title | `<h3 class="text-24 line-height-30">TITLE</h3>` |
| company | first `<span><i class='fa fa-briefcase'></i>NAME</span>` inside the card's icon-info block |
| location | `<span><i class='fas fa-map-marker-alt'></i>LOCATION</span>` — e.g. `"Remoto"`, `"Curitiba/PR  (Híbrido)"` (double space before the parenthetical is real markup, collapsed by the parser's whitespace cleanup) |
| date | **not present anywhere on the card.** No relative-date string, no `datetime` attribute, nothing. Always reported as `null`; never inferred. |
| tags | every `<span class='tag-list background-gray'>TAG</span>` in the card's second inner `<div>` (the tech-stack pill list, e.g. `Flutter`, `Dart`, `Firebase`, `Kotlin`, `Swift`) — a bonus field beyond the base portal-skill contract, used as the second half of the client-side query filter alongside title |

**Card-boundary note**: the site's sidebar filter list uses a *different, longer* class
string for its own pills (`class="company-tag tag-list background-gray tag-shadow
relative-block"`, double-quoted) than a job card's tech tags (`class='tag-list
background-gray'`, single-quoted, no other classes) — confirmed live that zero matches of
the card-tag pattern appear anywhere before the first `cell-list` card in the document, so
the two never collide even though chunk-splitting means the very last card's chunk runs to
the true end of the page.

## Detail — not implemented

```
GET https://programathor.com.br/jobs/<id>-<slug>
```

**Confirmed broken at the time this skill was built.** Every job id tried (33724, 33756,
33685 — spanning both a Flutter-tagged listing and unrelated ones) returned a themed
`HTTP 500 "Há algo de errado com essa página"` response from ProgramaThor's own
application. Ruled out as a request-shape or bot-detection issue:
- A `.json` suffix on the same path returned `{"status":500,"error":"Internal Server
  Error"}` — a genuine server error, not an HTML challenge page.
- A trailing slash on the same URL still 500'd.
- Swapping this skill's own `Mozilla/5.0 (compatible; programathor-search-cli/1.0)`
  User-Agent for a full desktop-Chrome UA string still 500'd.
- The listing page (`/jobs`) itself loads fine with the exact same request shape and
  UA, including its own Cloudflare rocket-loader script — so this isn't a site-wide
  Cloudflare challenge either, just the detail route specifically.

Given the add-portal workflow's mandatory Step 4 live-verification rule ("never register
a portal skill that has not returned real results"), this skill ships **without** a
working `detail` command rather than one that cannot be verified. `commands/detail.ts`
returns a clear, documented `DETAIL_UNSUPPORTED` error instead of attempting to parse a
page that never renders.

If ProgramaThor fixes this later, the detail page (when it worked, based on cached search
snippets from other sessions and this portal's general template family) would likely
follow the same `<h3>`/icon-span pattern as the listing cards — re-run `/add-portal` on
`programathor.com.br` to verify and wire up a real parser rather than guessing from this
note.

## Notes

- No authentication required for `search`.
- Card counts are consistently 15 per page across every query tried during
  investigation (unfiltered, `place=`-filtered, and `remoto=true`-filtered alike).
- Keep volume low as a general courtesy, even though robots.txt itself is unusually
  permissive for this portal.
