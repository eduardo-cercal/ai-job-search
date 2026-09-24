# trampos.co URL Reference

Public, unauthenticated JSON API used by this skill.

## Access basis (checked 2026-09-09)

`https://www.trampos.co/robots.txt`:

```
User-agent: *
Disallow:
Disallow: /admin/
```

Only `/admin/` is disallowed. The API path this CLI uses (`/api/v2/opportunities`)
is not blocked. No login wall — confirmed live.

## Discovering the real search mechanism

The rendered `/oportunidades?<query>` page is **not** where results live: it is a
Rails-served page whose only static content is a `<noscript>` fallback showing a
fixed set of "featured" jobs, unrelated to whatever query string was passed. Real
results are fetched client-side by the site's Ember.js app (codename "frodo",
confirmed via its bundle's `frodo/routes/...`, `frodo/controllers/...` module
paths). Reading that bundle (`https://cdn0.trampos.co/frodo-assets/assets/frodo-*.js`)
surfaced both the API endpoint and the real (non-obvious) query parameter names:

```js
queryParams: ["tr", "lc", "ct", "tp"],
tr: Ember.computed.alias("controllers.application.keywords"),
lc: Ember.computed.alias("controllers.application.location"),
```

## Search

```
GET https://www.trampos.co/api/v2/opportunities?tr=<query>&lc=<city>&ct[]=<category>&tp[]=<type>&page=<n>
```

| Param | Meaning | Example |
|-------|---------|---------|
| `tr` | Free-text keyword search (short for "termo") | `flutter` |
| `lc` | City name (short for "localização") | `Curitiba` |
| `ct[]` | Category slug, repeatable for "any of" (sent as `ct%5B%5D=` per entry - confirmed live) | `ti` |
| `tp[]` | Opportunity type slug, repeatable. Confirmed vocabulary (from the API's own `types` facet): `emprego`, `estagio`, `banco-talentos` | `emprego` |
| `page` | 1-indexed page. **Confirmed working live** - `page=2` returns a genuinely different result set | `2` |

Every response also returns its own facets, so the category vocabulary is
self-documenting rather than hardcoded:

```json
{
  "opportunities": [...],
  "types": [{"name": "Emprego", "slug": "emprego", "count": 57}, ...],
  "categories": [{"name": "Tecnologia da Informação", "slug": "ti", "count": 7}, ...],
  "pagination": {"total": 64, "total_pages": 6, "per_page": 12}
}
```

No native posting-age parameter was found in the bundle — `--jobage` in this CLI is
a client-side filter over each result's `published_at`.

Each `opportunities[]` entry carries (fields this CLI reads):

```
id, name, company.name, city, state, hybrid, published_at, category_name, type_name
```

There is no `home_office` field on **search** results (only on **detail** results,
see below) — a search-list "Home Office" label can't be produced without a detail
fetch; search only distinguishes `hybrid` vs. not.

No `url` field is returned either. This CLI constructs the detail URL from the bare
id: `https://www.trampos.co/oportunidades/<id>` — confirmed live to resolve
identically to the full slugged URL Rails' FriendlyId would produce
(`/oportunidades/<id>-<slug>`); the slug suffix is cosmetic only.

## Detail

```
GET https://www.trampos.co/api/v2/opportunities/<id>
```

Clean JSON, no HTML parsing needed:

```
opportunity.id, .name, .company.name
opportunity.city, .state, .hybrid, .home_office
opportunity.published_at
opportunity.category_name, .type_name
opportunity.description, .prerequisite, .desirable, .perks   (all plain text, no HTML tags observed)
opportunity.salary        → "NÃO DIVULGADA" is the site's own "not disclosed" placeholder, not a real value
opportunity.regime        → "INDIFERENTE" is the site's own "no preference" placeholder, not a real value
opportunity.url            → the canonical, slugged detail-page URL (present here, unlike on search results)
```

This CLI treats `"NÃO DIVULGADA"`/`"INDIFERENTE"` as `null` rather than passing
through the placeholder text as if it were real data.

## Notes

- No authentication required for either endpoint.
- Pagination is genuinely confirmed working here — a real advantage over some other
  Brazil-market portal CLIs in this repo whose SSR pages cap at page 1 regardless
  of the request.
- The CLI backs off on 429/5xx with the same exponential-backoff-plus-jitter pattern
  as this repo's other portal CLIs; a 404 returns no results rather than crashing.
- `detail`'s `id` accepts either a bare numeric id or a full trampos.co job URL.
