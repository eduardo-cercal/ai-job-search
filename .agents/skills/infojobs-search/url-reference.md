# InfoJobs URL Reference

Public, unauthenticated pages on `www.infojobs.com.br`. Captured 2026-09-04 — InfoJobs
ships no public JSON search API, so this skill parses server-rendered HTML for page 1 and
InfoJobs' own infinite-scroll fragment endpoint for later pages (discovered by reading
their shipped `list.js` bundle), plus a `schema.org/JobPosting` JSON-LD block for detail
pages.

> robots.txt (`https://www.infojobs.com.br/robots.txt`) disallows a long list of legacy
> account/static pages and, notably, `/detailvacancy.aspx` and `/detailcompany.aspx` — but
> **not** `/empregos.aspx`, the `/vaga-de-...aspx` pretty detail URLs, or `/mf-publicarea/`,
> all of which this skill uses. No dedicated crawler-permission block for AI bots was found
> (unlike Catho's), and no Terms-of-Use restriction on automated access was located. As a
> precaution, following the same pattern as every other portal skill in this repo,
> **treat this as personal use**: keep request volume low, don't use it for bulk/commercial
> data collection.

## Search — page 1

```
GET https://www.infojobs.com.br/empregos.aspx?palabra=<query>
```

- `palabra` ("word" in Spanish — InfoJobs is Spanish-owned; the param name never got
  localized) is the keyword/title query. There is also a canonical pretty-URL form
  (`/vagas-de-emprego-<slug>.aspx`, visible in the page's own `#hdn_ListURL` hidden
  field) that the site's own search box redirects to, but the plain `?palabra=` query
  form returns identical results and is simpler to build — the CLI uses it.
- **No separate location query parameter for free-text place names.** The UI's location
  field (`name="city"`) is an autocomplete widget that resolves to an internal location id
  (`data-idlocation2`/`data-idlocation3`); confirmed live that appending `&city=<name>` to
  the search URL does not change the result set. Folding the city into the keyword text
  (`palabra=desenvolvedor+flutter+curitiba`) does filter correctly — confirmed live (8
  unfiltered results narrowed to results whose `location` field all read `Curitiba - PR`
  once "curitiba" was added to the query). This CLI's `--location` flag folds the value
  into `palabra` for exactly this reason (same pattern `jobindex-search` documents for its
  own city-in-query workaround).

Returns full HTML. Each result is one card:

```html
<div id="vacancy<id>" data-id="<id>" class="... js_rowCard js_cardLink" data-href="<detail-url>">
  ...
  <div hidden class="js_date" data-value="YYYY/MM/DD HH:MM:SS"></div>
  ...
  <h2 class="... js_vacancyTitle">TITLE</h2>
  ...
  <div class="text-body">
    <!-- named employer: -->
    <a class="text-body text-decoration-none" href="...">COMPANY<span class="text-nowrap">...verified badge...</span></a>
    <!-- OR, for a blind listing, bare text with no <a>: -->
    Empresa<span class="text-nowrap">confidencial<span ...verified badge...>...</span></span>
  </div>
  ...
  <div class="mb-8">CITY - STATE<span hidden>...distance text...</span></div>
</div>
```

| Field | Where |
|-------|-------|
| id | `data-id="<id>"` (also `id="vacancy<id>"`) on the card's opening `<div>` |
| title, url | `data-href="<url>"` on the same tag; title in the following `<h2 class="...js_vacancyTitle">` |
| company | `<div class="text-body">` block right after the rating stars — either a linked `<a class="text-body text-decoration-none">NAME</a>` or, for a blind ("Empresa confidencial") listing, bare text with no link at all |
| location | `<div class="mb-8">CITY - STATE<span>...</span></div>` — capture text up to the next tag, not up to `</div>`, since a "N Km de você" distance span can follow |
| date | `<div hidden class="js_date" data-value="YYYY/MM/DD HH:MM:SS">` — exact datetime, not a relative string like Catho's. Convert to ISO by replacing `/` with `-` and truncating to the date portion. |

**Parsing trap — verified-employer tooltip.** A verified-employer badge's `data-bs-title`
and `title` attributes carry the tooltip's own **literal, HTML-escaped markup** as their
attribute value, e.g. `data-bs-title="<div class='text-left'>Este selo indica que a
empresa foi verificada...</div>"`. A naive `[\s\S]*?<\/div>` bound on the company block
matches that fake `</div>` *inside the attribute string* before it reaches the real
closing tag — this silently truncated the match and/or leaked tooltip text into the
company field until fixed (see the sanitization step in `helpers.ts`). Both attributes are
safe to strip globally before parsing: their values are double-quoted and contain no
literal `"` (the nested markup uses single quotes).

**No total result count found** anywhere in the page markup (unlike Catho's meta
description). `meta.count` in this CLI's output is just the number of cards actually
returned for that page.

## Search — page 2+

InfoJobs' own frontend paginates via **infinite scroll** (see `hdn_infinitescrolldesktop`
and the `js_infiniteScrollLoading` class), but that behavior is gated to mobile UAs in
their own code (`passFilter()` checks `detectService.isMobile()`). The underlying fetch
still works from any client:

```
GET https://www.infojobs.com.br/mf-publicarea/VacancyList/GetVacancyListFragment?url=<url-encoded search URL, with &page=N appended>
```

Found by reading `list.js`'s `GetVacancyListFragment` service class
(`this.Url = "/mf-publicarea/VacancyList/GetVacancyListFragment"`, called as
`` `${this.Url}?url=${encodeURIComponent(searchUrl)}` ``). Returns JSON:

```json
{ "eof": false, "listFragmentHTML": "<div id=\"vacancy...\">...same per-card markup as page 1...</div>..." }
```

Confirmed live: `page=2` on this endpoint returns 20 offers with **zero id overlap**
against page 1's results for the same query. Plain `&page=2` appended directly to
`/empregos.aspx` (without going through the fragment endpoint) is silently ignored and
returns page 1 again — pagination only works through this fragment API.

**No confirmed date/age filter parameter** — none of the visible filter facet keys
(`categoria`, `idw`, `im`, `isr`, `re`, `sprd`, `tipocontrato`, `wo`) look date-related, and
`list.js` gave no obvious lead either. The CLI filters `--jobage` client-side using each
card's own `js_date` value.

## Detail

```
GET https://www.infojobs.com.br/vaga-de-<any-slug>__<id>.aspx
```

Confirmed live: the slug is cosmetic — InfoJobs resolves the posting from the trailing
numeric id regardless of the slug text (tested `vaga-de-qualquer-coisa__<id>.aspx`), so
the CLI uses a fixed placeholder (`vaga-de-vaga__<id>.aspx`). Note the URL needs a
non-empty `vaga-de-<something>` prefix before the id — a bare `/vaga__<id>.aspx` 404s.

Returns full HTML containing a `schema.org/JobPosting` JSON-LD block:

```html
<script type="application/ld+json">
{
  "@context": "http://schema.org",
  "@type": "JobPosting",
  "title": "...",
  "description": "...",          // contains literal <br> tags as line separators, plus
                                  // plain-text paragraphs — convert <br> to \n, then strip
                                  // any remaining tags
  "datePosted": "2025-11-03T10:56:00.0000000",
  "validThrough": "2026-10-06T11:26:00.0000000",
  "employmentType": "Jornada completa",
  "hiringOrganization": {"@type": "Organization", "name": "..."},
  "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress",
    "addressLocality": "...", "addressRegion": "...", "addressCountry": "..."}}
}
</script>
```

Two differences from Catho's otherwise-identical JobPosting block: `jobLocation` is a
**single object**, not an array (handle both shapes defensively), and `description`
contains literal `<br>` tags rather than being pure plain text.

## Notes

- No authentication required for any of the above.
- Keep volume low regardless of what robots.txt technically allows (see the caution above).
