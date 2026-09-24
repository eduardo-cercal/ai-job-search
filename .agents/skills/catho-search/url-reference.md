# Catho URL Reference

Public, unauthenticated pages on `www.catho.com.br`. Captured 2026-09-04 — Catho ships
no public JSON API for search, so this skill parses server-rendered HTML for search
results and a `schema.org/JobPosting` JSON-LD block for detail pages.

> robots.txt (`https://www.catho.com.br/robots.txt`) explicitly disallows `/buscar/vagas/`
> and several query-string forms (`?q=`, `?s=`, `?area_id=`, `?perfil_id=`, `?origem=`,
> `?utm_source=`, etc.) but does **not** disallow the `/vagas/<slug>/...` pretty-URL path
> this skill uses. The same `robots.txt` explicitly `Allow: /` for GPTBot, Google-Extended,
> Claude-Web, anthropic-ai and other AI/search crawlers. A dedicated Terms-of-Use page could
> not be located at the time of writing (the obvious URLs 404). Given that, and following
> the same caution this repo applies to other portals, **treat this as personal-use only**:
> keep request volume low, do not use it for bulk/commercial data collection.

## Search

```
GET https://www.catho.com.br/vagas/<query-slug>/[<location-slug>/][pagina-<n>/]
```

- `<query-slug>`: the job title/keyword, lowercased, accents stripped, spaces to hyphens
  (e.g. `desenvolvedor flutter` -> `desenvolvedor-flutter`). Required — Catho has no
  results page for an empty profession segment.
- `<location-slug>`: optional. A city name (`curitiba`) or a two-letter state abbreviation
  (`pr`) both work as an extra path segment and narrow results to that place. Confirmed via
  live fetch: `/vagas/desenvolvedor-flutter/curitiba/` and `/vagas/desenvolvedor-flutter/pr/`
  both return city/state-filtered result sets with a matching `<title>`.
- `pagina-<n>/`: optional trailing segment for page `n` (omit for page 1). Confirmed live:
  `?pagina=2` (query form) and `pagina-2/` (path form) both paginate; the CLI uses the path
  form to stay clear of the `?`-prefixed disallow rules in robots.txt even though they don't
  actually match this parameter name. `?p=2` does **not** paginate (silently ignored, ends
  up as page 1) — do not use it.

Returns full HTML. Each result is one `<li data-offer-item="<id>">` element containing:

| Field | Where |
|-------|-------|
| id | `data-offer-item="<id>"` attribute on the `<li>` |
| title, url | `<h2 class="title_offer"><a href="<url>" title="<title>">` |
| company | `<span class="text-12">NAME</span>` (or `<span class="text-12 mr-2">Empresa Confidencial</span>` for blind listings) inside the following `<p class="mb-2">` |
| location | `<span class="icon i_job_location"></span><strong>N vagas</strong> - <city>` — a `+N cidades` link can follow the city name before `</p>` closes, so the parser must not require `</p>` immediately after the city text (confirmed live: this silently dropped ~30% of listings before the fix) |
| date | `<span class="tag pub_hoje|pub_ontem|...">Publicada Hoje\|Publicada Ontem\|Publicada em DD/MM\|Atualizada ...</span>`. A handful of markup positions carry unrendered Vue template placeholders (`{{dateUpdateFormat...}}`) instead of real text — skip any match containing `{{`. |

**Total result count**: not in the HTML body markup; only in the `<meta name="description">`
tag, e.g. `"...8.868 vagas disponíveis em todo o Brasil..."`, using Brazilian dot-thousands
notation (normalize by stripping `.` before parsing to an integer — same pattern as
`jobindex-search`'s `.` thousands separator).

**No confirmed date/age filter parameter.** Several likely query-param names were probed
live (`data_publicacao`, `publishDate`, `periodo`, `dias`, `data`) and none changed the
result set — Catho's date filter is applied client-side by the site's own JS from a
`publishDate` field in `window.searchBoxFilters`, not a simple GET param we could identify
without reverse-engineering the deferred JS bundle. The CLI instead filters client-side
using each card's own `date` text, converted to an ISO date (`parseRelativeDate` in
`helpers.ts`) and compared against the requested `--jobage` window.

## Detail

```
GET https://www.catho.com.br/vagas/<any-slug>/<id>
```

Confirmed live: the slug segment is cosmetic — Catho resolves the posting purely from the
trailing numeric id, so any placeholder slug (the CLI uses `vaga`) works. Returns full HTML
containing a `schema.org/JobPosting` JSON-LD block:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "...",
  "description": "...",         // plain text with literal \n paragraph breaks, already
                                 // unescaped by JSON parsing — no HTML entity decoding needed
  "datePosted": "2026-07-20T23:59:59Z",
  "employmentType": "CLT (Efetivo)",
  "hiringOrganization": {"@type": "Organization", "name": "..."},
  "jobLocation": [{"@type": "Place", "address": {"@type": "PostalAddress",
    "addressLocality": "...", "addressRegion": "...", "addressCountry": "..."}}]
}
</script>
```

This is far more reliable than scraping the rendered detail page — the description is
already a clean plain-text string, and the fields are stable schema.org names. Some
listings omit `baseSalary` entirely (Catho shows "A Combinar" / negotiable in that case);
treat a missing field as absent, not an error.

## Notes

- No authentication required for any of the above.
- `addressLocality` in the JSON-LD is sometimes the state name rather than a city (seen on
  a live listing) — Catho's own data, not a parsing bug. The CLI reports `location` as
  `"<locality>, <region>"` as-is.
- Keep volume low regardless of what robots.txt technically allows (see the caution above).
