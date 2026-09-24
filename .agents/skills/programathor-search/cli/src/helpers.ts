// Data source: ProgramaThor's public job-listing page (programathor.com.br/jobs). No
// authentication. Each result is one <div class="cell-list "> card; we split on that
// marker and parse each chunk independently (a malformed card cannot break the rest —
// same approach as catho-search/vagas-search's card parsers).
//
// IMPORTANT — this skill is search-only. ProgramaThor has no server-side full-text
// search parameter: q=/search=/query=/keyword= were all probed live and confirmed to be
// silently ignored no-ops (identical result sets, byte-for-byte, aside from a per-request
// CSRF token and a request-timing script). --query is instead a client-side filter over
// each fetched card's own title and tech-stack tags — see filterCards below. Separately,
// every job **detail** page (/jobs/<id>-<slug>) returns a genuine site-side HTTP 500 at
// the time this skill was built — confirmed live across multiple job ids, a browser-like
// User-Agent, and a trailing-slash/.json variant of the URL, so this is ProgramaThor's own
// bug, not a bot-detection response or a parsing gap in this CLI. There is no `detail`
// command here; see commands/detail.ts for the deliberate, documented error it returns.

export const BASE_URL = "https://programathor.com.br"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; programathor-search-cli/1.0)"

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
  date: string | null // always null — ProgramaThor's listing cards carry no posting-date field
  url: string
  tags: string[] // tech-stack pills on the card (e.g. ["Flutter", "Dart", "Firebase"]) — bonus field beyond the base contract, used for client-side query filtering
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
 * Build the search URL: /jobs[?place=<location>][&page=<n>]. There is no query
 * parameter — see the module comment. `place` is confirmed live as a real filter (both
 * a city name and the literal value "Remoto" narrow every returned card's location field
 * accordingly); `page` is confirmed live as real pagination (page 2 vs page 1 returned
 * zero overlapping job ids) even though no pagination link appears in the rendered page.
 */
export function buildSearchUrl(location: string | undefined, page: number): string {
  const url = new URL(`${BASE_URL}/jobs`)
  if (location) url.searchParams.set("place", location)
  if (page > 1) url.searchParams.set("page", String(page))
  return url.toString()
}

/**
 * Parse the job-listing page: a flat list of <div class="cell-list "> cards. We split on
 * the marker and parse each chunk independently. The tags pill list uses a distinctive
 * `class='tag-list background-gray'` (single-quoted, no other classes) that does not
 * collide with the sidebar's filter-facet pills (`class="company-tag tag-list
 * background-gray tag-shadow relative-block"`, double-quoted, extra classes) — confirmed
 * live: zero matches of the card pattern appear before the first card in the document.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split('<div class="cell-list ">').slice(1)

  for (const chunk of chunks) {
    const linkMatch = chunk.match(/<a href="\/jobs\/(\d+)-([^"]*)"/i)
    if (!linkMatch) continue
    const id = linkMatch[1]
    const url = `${BASE_URL}/jobs/${id}-${linkMatch[2]}`

    const titleMatch = chunk.match(/<h3 class="text-24 line-height-30">([^<]*)<\/h3>/i)
    if (!titleMatch) continue
    const title = clean(titleMatch[1])
    if (!title) continue

    let company: string | null = null
    const companyMatch = chunk.match(/fa-briefcase'>\s*<\/i>([^<]*)<\/span>/i)
    if (companyMatch) company = clean(companyMatch[1]) || null

    let location: string | null = null
    const locationMatch = chunk.match(/fa-map-marker-alt'>\s*<\/i>([^<]*)<\/span>/i)
    if (locationMatch) location = clean(locationMatch[1]) || null

    const tags = Array.from(chunk.matchAll(/tag-list background-gray'>([^<]*)<\/span>/gi))
      .map((m) => clean(m[1]))
      .filter(Boolean)

    results.push({ id, title, company, location, date: null, url, tags })
  }

  return results
}

/**
 * Client-side query filter: splits the query into words and requires every word to
 * appear, case-insensitively and in any order, somewhere across the card's title and
 * tech-stack tags. Word-level AND matching (rather than requiring the whole query as one
 * contiguous substring) is deliberate: a real title like "Desenvolvedor(a) Mobile Flutter
 * - Sênior" does not contain "Desenvolvedor Flutter" as a literal substring even though it
 * is an obvious match for that query. This stands in for a real search parameter, which
 * ProgramaThor does not have — see the module comment.
 */
export function filterCardsByQuery(cards: JobCard[], query: string): JobCard[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return cards
  return cards.filter((c) => {
    const haystack = `${c.title} ${c.tags.join(" ")}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}

/** Parse the trailing numeric ID out of a raw ID, a ProgramaThor job URL, or any string containing one. */
export function normalizeId(input: string): string | null {
  const m = input.match(/\/jobs\/(\d+)-/) || input.match(/(\d{3,})/)
  return m ? m[1] : null
}
