# Vagas.com URL Reference

Public, unauthenticated pages on `www.vagas.com.br`. Captured 2026-09-04 — Vagas.com ships
no public JSON API for search, so this skill parses server-rendered HTML for both search
results and job detail (unlike Catho, Vagas.com's detail pages carry no
`schema.org/JobPosting` JSON-LD — only a generic `WebSite` schema block, confirmed live).

> `robots.txt` (`https://www.vagas.com.br/robots.txt`) ships a Cloudflare "Content-Signal"
> block (`search=yes, ai-train=no, use=reference` for `User-agent: *`, plus explicit
> `Disallow: /` blocks for GPTBot, Google-Extended, CCBot, Bytespider, ClaudeBot and a
> handful of other AI-training crawlers) followed by a separate classic `robots.txt`
> section for general search engines that disallows `/auth/`, `/move_to`, `/servicos/`,
> `/v1/`, `/api/`, `/social/`, `/users/`, `/token/`, `/vagas/pesquisas`, `/suporte`,
> `/mapa-de-carreiras/cargo/`, `/suporte-flix` — none of which this skill's search
> (`/vagas-de-<slug>`) or detail (`/vagas/v<id>/...`) paths touch. The Content-Signal
> block's `ClaudeBot: Disallow: /` targets AI-training crawlers by declared purpose
> (`ai-train=no`), which does not describe this skill's use (personal job search, not
> model training) — but no dedicated Terms-of-Use page could be located to confirm
> bulk-access rules either way. As a precaution, **treat this as personal-use only**:
> keep request volume low, do not use it for bulk/commercial data collection.

## Search

```
GET https://www.vagas.com.br/vagas-de-<query-slug>[?e[]=<location text>][&page=<n>]
```

- `<query-slug>`: the job title/keyword, lowercased, accents stripped, spaces to hyphens
  (e.g. `desenvolvedor flutter` -> `desenvolvedor-flutter`). Required — there is no
  results page for an empty query segment.
- `e[]=<location text>`: optional. Confirmed live as a **real filter, not a cosmetic
  no-op** — `?e[]=São Paulo` on a broad "analista" query narrowed every one of 40 returned
  results to a São Paulo-state city, and the result count in the page's own `<h1>` dropped
  from 746 to 423. Pass the location's own display text (a city or a state name), not a
  slug — the CLI URL-encodes it via `URLSearchParams`.
- `page=<n>`: optional, 1-indexed (omit for page 1). Confirmed live: `page=2` and `page=3`
  each returned 40 results with **zero id overlap** with each other and with page 1 — this
  is genuine pagination, not a re-shuffled default set. Two other guesses were tried and
  rejected: `pagina=2` (query form) returned a result set with partial ~20% overlap with
  page 1, suggesting the param is silently ignored and the site is re-serving a
  freshly-reindexed page 1 rather than a real page 2; `/pagina-2` (path form, mimicking
  Catho's pattern) returned a fully-rendered page with **zero job results** — the site
  parsed it as `<query>/pagina-2` glued into one query slug rather than a page-2 request.
  Use `?page=<n>` only.

Returns full HTML. Each result is one `<li class="vaga <parity> ">` element (parity is
`odd`/`even`, purely cosmetic) containing:

| Field | Where |
|-------|-------|
| id | `data-id-vaga="<id>"` attribute on `<a class="link-detalhes-vaga" ...>` |
| title | `title="<title>"` attribute on that same `<a>` — **not** its inner text, which wraps matched query terms in `<mark>` (e.g. `<mark>Analista</mark> de Marketing`) |
| url | `href="/vagas/v<id>/<slug>"` attribute on that same `<a>` (relative; prefix with `https://www.vagas.com.br`) |
| company | `<span class="emprVaga">NAME</span>` — reads `Confidencial` verbatim for blind listings, no special-case parsing needed |
| location | `<div class="vaga-local"><i class="bx bx-map"></i>CITY / UF</div>` — a nested `<div class="tooltip-place">` immediately follows the location text before the outer `</div>` closes, so the parser must capture up to the next `<` rather than requiring a specific closing tag (same shape as the Catho "+N cidades" gotcha this repo has hit before) |
| date | `<span class="data-publicacao"><i class="bx bx-time-five"></i>DD/MM/YYYY</span>` — always a full `DD/MM/YYYY` date, never a relative "Hoje"/"Ontem" string (unlike Catho), so no year-inference logic is needed |

**Total result count**: in the page's own `<h1>`, e.g. `<h1>746 vagas de emprego para
analista</h1>` (plural) or `<h1>1 vaga de emprego para desenvolvedor flutter</h1>`
(singular, no trailing "s" on "vaga"). Both forms must be matched.

**No confirmed date/age filter parameter.** A `?ordenar_por=mais_recentes` /
`?ordenar_por=mais_relevantes` query param exists (found in the page's own sort-order
links) but it is a **sort**, not a filter — it reorders the existing result set rather
than narrowing it to a date window. The CLI does not use it; `--jobage` is implemented as
a client-side filter over each card's own `date` field instead. A `h[]=<code>` param was
also found in the filter sidebar but is a **seniority-level** facet (e.g. `h[]=30` means
"Júnior/Trainee"), not a date filter — do not repurpose it.

## Detail

```
GET https://www.vagas.com.br/vagas/v<id>/<any-slug>
```

Confirmed live: the slug segment is cosmetic — requesting a deliberately wrong slug for a
valid id (`/vagas/v2824782/qualquer-coisa-aleatoria`) returns an HTTP **301** redirect to
the canonical slug for that id, so any placeholder slug (the CLI uses `vaga`) works.
Returns full HTML with no `schema.org/JobPosting` JSON-LD (only a generic `WebSite` schema
block appears twice in the `<head>`) — every field below is scraped from the rendered page:

| Field | Where |
|-------|-------|
| title | `<h1 class="job-shortdescription__title">TITLE</h1>` |
| company | `<h2 class="job-shortdescription__company">NAME</h2>` |
| location | `<span class="info-localizacao">CITY<div class="tooltip-place">...</div></span>` — same nested-tooltip gotcha as the search-results location field; capture up to the next `<` |
| employment type | `<span class="info-modelo-contratual" title="Regime CLT">Regime CLT</span>` |
| salary | `<span>Faixa salarial</span>` followed immediately by a sibling `<span>VALUE</span>` inside the same wrapping `<div>` — usually `"a combinar"` (negotiable/undisclosed); no nested `<div>` sits between the label and value spans (verified against a live fetch — an earlier draft of this skill assumed a nested `<div>` here from a hand-built test fixture and silently returned `null` for every real posting until the Step 4 live test caught it) |
| posted date | `Publicada em DD/MM/YYYY` text inside `<li class="job-breadcrumb__item job-breadcrumb__item--published ...">` |
| description | `<div class="job-tab-content job-description__text texto" data-testid="JobDescription">...</div>` — HTML fragment using `<p>`, `<br>`, `<strong>`, `<b>`, `<em>` and literal `•` bullet characters (some followed by a literal tab character, normalized to a single space); no nested `<div>` appears inside this block in any observed posting, so a single non-greedy match up to the next `</div>` is safe |

**No deadline/application-close-date field was found anywhere on the detail page** for
the sample posting inspected — Vagas.com postings do not appear to carry an explicit
deadline the way some other portals do. Report `null` rather than guessing.

## Notes

- No authentication required for any of the above.
- Vagas.com also exposes benefit facets (`b[]=<benefit name>`) and a country facet
  (`p[]=Brasil`) in its filter sidebar; neither is wired into this CLI (out of scope for
  the shipped `--location`/`--jobage` flags), but they follow the same query-param
  pattern as `e[]` if a future maintainer wants to add them.
- Keep volume low regardless of what robots.txt technically allows (see the caution above).
