// Data source: Vagas.com's public job-search pages (www.vagas.com.br). No authentication.
// Search results are server-rendered HTML (per-<li class="vaga ..."> cards); we split on
// that marker and parse each chunk independently (a malformed card cannot break the rest —
// same approach as catho-search's parseOfferCards).
// Detail pages carry no JobPosting JSON-LD (only a generic WebSite schema block, checked
// live), so the description and metadata are parsed from the rendered detail-page markup.

export const BASE_URL = "https://www.vagas.com.br"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; vagas-search-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  salary: string | null
}

/**
 * Slugify a query into Vagas.com's pretty-URL segment format: lowercase, diacritics
 * stripped, non-alphanumeric runs collapsed to a single hyphen, no leading/trailing
 * hyphen. Confirmed live: the site accepts ASCII slugs for accented queries and
 * redirects a wrong-but-plausible slug to the canonical one (slug is not load-bearing
 * beyond the query terms it encodes).
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function clean(text: string): string {
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim()
}

/**
 * Build the search URL: /vagas-de-<query-slug>[?e[]=<location>][&page=N].
 * Confirmed live: `?page=N` returns a distinct, non-overlapping result set per page
 * (verified N=2 vs N=3 share zero job ids); `?e[]=<location text>` is a real facet
 * filter, not a cosmetic no-op (verified live: adding it to a broad query narrows
 * every result's location field to that place) - pass the location as free text
 * (a city or state name), not slugified, since the facet value is the site's own
 * display text for that place.
 */
export function buildSearchUrl(query: string, location: string | undefined, page: number): string {
  const url = new URL(`${BASE_URL}/vagas-de-${slugify(query)}`)
  if (location) url.searchParams.append("e[]", location)
  if (page > 1) url.searchParams.set("page", String(page))
  return url.toString()
}

/**
 * Parse the search-results page: a flat list of <li class="vaga ..."> cards. We split
 * on the marker and parse each chunk independently. Title is read from the `title="..."`
 * attribute on the card's link rather than its inner text, because the inner text wraps
 * matched query terms in <mark> (e.g. "<mark>Analista</mark> de Marketing").
 */
export function parseOfferCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<li class="vaga /).slice(1)

  for (const chunk of chunks) {
    const linkMatch = chunk.match(
      /<a class="link-detalhes-vaga" data-id-vaga="(\d+)"[^>]*title="([^"]*)"[^>]*href="([^"]+)"/i,
    )
    if (!linkMatch) continue
    const id = linkMatch[1]
    const title = clean(linkMatch[2])
    if (!title) continue
    const hrefRaw = decodeHtmlEntities(linkMatch[3])
    const url = hrefRaw.startsWith("http") ? hrefRaw : `${BASE_URL}${hrefRaw}`

    let company: string | null = null
    const companyMatch = chunk.match(/<span class="emprVaga">\s*([^<]*?)\s*<\/span>/i)
    if (companyMatch) company = clean(companyMatch[1]) || null

    // Capture up to the next tag rather than requiring a specific closing tag: the
    // location text is immediately followed by a nested tooltip <div> on every card.
    let location: string | null = null
    const locMatch = chunk.match(/<div class="vaga-local">\s*<i class="bx bx-map"><\/i>\s*([^<]+)/i)
    if (locMatch) location = clean(locMatch[1]) || null

    let date: string | null = null
    const dateMatch = chunk.match(
      /<span class="data-publicacao"><i class="bx bx-time-five"><\/i>([^<]+)<\/span>/i,
    )
    if (dateMatch) date = clean(dateMatch[1]) || null

    results.push({ id, title, company, location, date, url })
  }

  return results
}

/** Convert Vagas.com's DD/MM/YYYY posted-date text into an ISO date (YYYY-MM-DD). */
export function parseBRDate(text: string | null): string | null {
  if (!text) return null
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  const [, day, month, year] = m
  return `${year}-${month}-${day}`
}

/** Total result count from the search page's <h1> ("746 vagas de emprego para analista" / "1 vaga de emprego para..."). */
export function parseTotalCount(html: string): number | null {
  const m = html.match(/<h1[^>]*>\s*([\d.]+)\s+vagas?\s+de\s+emprego/i)
  if (!m) return null
  const n = parseInt(m[1].replace(/\./g, ""), 10)
  return Number.isFinite(n) ? n : null
}

/** Parse the trailing numeric ID out of a raw ID, a Vagas.com job URL (/vagas/v<id>/...), or any string containing one. */
export function normalizeId(input: string): string | null {
  const m = input.match(/\/v(\d{5,})(?:[\/?]|$)/) || input.match(/(\d{5,})/)
  return m ? m[1] : null
}

/** Strip tags from a description fragment, decode entities, and preserve paragraph breaks. */
function stripDescriptionTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\t/g, " ")
    .replace(/[  ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \n]+$/g, "")
    .replace(/^[ \n]+/g, "")
}

/**
 * Parse a job-detail page. Vagas.com carries no JobPosting JSON-LD (only a generic
 * WebSite schema block, confirmed live), so every field is read from the rendered
 * detail-page markup instead.
 */
export function parseJobDetail(html: string, id: string): JobDetail | null {
  const titleMatch = html.match(/<h1 class="job-shortdescription__title">\s*([^<]+?)\s*<\/h1>/i)
  if (!titleMatch) return null
  const title = clean(titleMatch[1])

  const companyMatch = html.match(/<h2 class="job-shortdescription__company">\s*([^<]+?)\s*<\/h2>/i)
  const company = companyMatch ? clean(companyMatch[1]) || null : null

  const locationMatch = html.match(/<span class="info-localizacao">\s*([^<]+)/i)
  const location = locationMatch ? clean(locationMatch[1]) || null : null

  const employmentMatch = html.match(/<span class="info-modelo-contratual"[^>]*>\s*([^<]+?)\s*<\/span>/i)
  const employmentType = employmentMatch ? clean(employmentMatch[1]) || null : null

  const salaryMatch = html.match(/Faixa salarial\s*<\/span>\s*<span>\s*([^<]+?)\s*<\/span>/i)
  const salary = salaryMatch ? clean(salaryMatch[1]) || null : null

  const publishedMatch = html.match(/Publicada em\s*(\d{2}\/\d{2}\/\d{4})/i)
  const date = publishedMatch ? parseBRDate(publishedMatch[1]) : null

  const descMatch = html.match(
    /<div class="job-tab-content job-description__text texto"[^>]*>([\s\S]*?)<\/div>/i,
  )
  const description = descMatch ? stripDescriptionTags(descMatch[1]) || null : null

  return {
    id,
    title,
    company,
    location,
    date,
    url: `${BASE_URL}/vagas/v${id}/vaga`,
    description,
    employmentType,
    salary,
  }
}
