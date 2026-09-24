// Data source: Catho's public job-search pages (www.catho.com.br). No authentication.
// Search results are server-rendered HTML (per-<li data-offer-item="ID"> cards); we split
// on that marker and parse each chunk independently (a malformed card cannot break the
// rest — same approach as linkedin-search's parseJobCards).
// Detail pages embed a schema.org JobPosting as JSON-LD (<script type="application/ld+json">),
// which we parse directly instead of scraping the rendered HTML.

export const BASE_URL = "https://www.catho.com.br"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; catho-search-cli/1.0)"

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
  addressRegion: string | null
  addressCountry: string | null
}

/**
 * Slugify a query or location into Catho's pretty-URL segment format:
 * lowercase, diacritics stripped, non-alphanumeric runs collapsed to a
 * single hyphen, no leading/trailing hyphen. Catho accepts both accented
 * and ASCII path segments for the same results, but ASCII is more robust
 * across shells/terminals, so we normalize to it.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

/** Build the search URL: /vagas/<query-slug>/[<location-slug>/][pagina-N/]. */
export function buildSearchUrl(query: string, location: string | undefined, page: number): string {
  const parts = [slugify(query)]
  if (location) parts.push(slugify(location))
  if (page > 1) parts.push(`pagina-${page}`)
  return `${BASE_URL}/vagas/${parts.join("/")}/`
}

/**
 * Parse the search-results page: a flat list of <li data-offer-item="ID"> cards.
 * We split on the marker and parse each chunk independently. Each card's fields
 * (title, company, location, date) all appear early in its own chunk, before the
 * next card's marker, so a first (non-global) match on each pattern stays scoped
 * to the right card even though the chunk technically runs to end-of-document.
 */
export function parseOfferCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<li data-offer-item="/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const titleMatch = chunk.match(/<h2 class="title_offer">\s*<a href="([^"]+)"\s+title="([^"]*)"/i)
    if (!titleMatch) continue
    const url = decodeHtmlEntities(titleMatch[1]).startsWith("http")
      ? decodeHtmlEntities(titleMatch[1])
      : `${BASE_URL}${decodeHtmlEntities(titleMatch[1])}`
    const title = clean(titleMatch[2])
    if (!title) continue

    let company: string | null = null
    const companyMatch = chunk.match(/<span class="text-12[^"]*">([^<]*)<\/span>/i)
    if (companyMatch) company = clean(companyMatch[1]) || null

    // Capture up to the next tag rather than requiring </p> immediately after:
    // a "+N cidades" link can follow the city name before the paragraph closes.
    let location: string | null = null
    const locMatch = chunk.match(
      /<span class="icon i_job_location"><\/span>\s*<strong>[\s\S]*?<\/strong>\s*-\s*([^<]+)/i,
    )
    if (locMatch) location = clean(locMatch[1]) || null

    let date: string | null = null
    const dateMatch = chunk.match(/<span class="tag pub_[a-z]+[^"]*">([^<]*)<\/span>/i)
    if (dateMatch && !dateMatch[1].includes("{{")) date = clean(dateMatch[1]) || null

    results.push({ id, title, company, location, date, url })
  }

  return results
}

/**
 * Convert Catho's relative posting-date text ("Publicada Hoje", "Atualizada Ontem",
 * "Publicada em 20/07") into an ISO date (YYYY-MM-DD). DD/MM has no year in the
 * source text; we assume the most recent occurrence of that day/month (this year,
 * or last year if that date has not happened yet this year — postings are never
 * future-dated). Returns null if the text does not match a known shape.
 */
export function parseRelativeDate(text: string | null, now: Date = new Date()): string | null {
  if (!text) return null
  const lower = text.toLowerCase()
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  if (lower.includes("hoje")) return toISO(now)
  if (lower.includes("ontem")) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - 1)
    return toISO(d)
  }
  const m = text.match(/(\d{2})\/(\d{2})/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10)
    let year = now.getUTCFullYear()
    let candidate = new Date(Date.UTC(year, month - 1, day))
    if (candidate.getTime() > now.getTime()) {
      year -= 1
      candidate = new Date(Date.UTC(year, month - 1, day))
    }
    return toISO(candidate)
  }
  return null
}

/** Total result count from the search page's meta description ("8.868 vagas disponíveis"). */
export function parseTotalCount(html: string): number | null {
  const m = html.match(/([\d.]+)\s+vagas dispon[ií]veis/i)
  if (!m) return null
  const n = parseInt(m[1].replace(/\./g, ""), 10)
  return Number.isFinite(n) ? n : null
}

/** Parse the trailing numeric ID out of a raw ID, a Catho job URL, or any string containing one. */
export function normalizeId(input: string): string | null {
  const m = input.match(/(\d{5,})(?:[\/?]|$)/) || input.match(/(\d{5,})/)
  return m ? m[1] : null
}

/**
 * Parse a job-detail page. Catho embeds the full posting as a schema.org
 * JobPosting JSON-LD block, which is far more reliable than scraping the
 * rendered HTML (already-decoded strings, stable field names).
 */
export function parseJobDetail(html: string, id: string): JobDetail | null {
  const m = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i)
  if (!m) return null
  let data: any
  try {
    data = JSON.parse(m[1])
  } catch {
    return null
  }
  if (!data || data["@type"] !== "JobPosting") return null

  const place = Array.isArray(data.jobLocation) ? data.jobLocation[0] : data.jobLocation
  const address = place?.address ?? {}
  const city: string | null = address.addressLocality ?? null
  const region: string | null = address.addressRegion ?? null
  const location = [city, region].filter(Boolean).join(", ") || null

  return {
    id,
    title: data.title ?? "(untitled)",
    company: data.hiringOrganization?.name ?? null,
    location,
    date: typeof data.datePosted === "string" ? data.datePosted.slice(0, 10) : null,
    url: `${BASE_URL}/vagas/vaga/${id}`,
    description: typeof data.description === "string" ? data.description : null,
    employmentType: data.employmentType ?? null,
    addressRegion: region,
    addressCountry: address.addressCountry ?? null,
  }
}
