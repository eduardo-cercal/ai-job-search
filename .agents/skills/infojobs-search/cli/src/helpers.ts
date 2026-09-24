// Data source: InfoJobs' public job-search pages (www.infojobs.com.br). No authentication.
// Page 1 is plain server-rendered HTML. Page 2+ is fetched through InfoJobs' own
// infinite-scroll fragment endpoint (found by reading their shipped list.js bundle —
// see url-reference.md), which returns { eof, listFragmentHTML } as JSON — the same
// per-card markup as page 1, just wrapped in JSON instead of a full document.
// Detail pages embed a schema.org JobPosting as JSON-LD, parsed directly.

export const BASE_URL = "https://www.infojobs.com.br"
const FRAGMENT_URL = `${BASE_URL}/mf-publicarea/VacancyList/GetVacancyListFragment`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; infojobs-search-cli/1.0)"

/** Fetch text (HTML or JSON) with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function httpFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
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
  validThrough: string | null
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

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/**
 * Build the search URL. InfoJobs has no separate location query parameter tied to
 * free-text city names in its public search (the UI's location field resolves to an
 * internal location id via an autocomplete API) — confirmed live: appending
 * `&city=<name>` to the search URL does not change the result set, while folding the
 * city into the keyword text does. So `location`, when given, is appended to the
 * query text itself (same pattern jobindex-search documents for its own area limits).
 */
export function buildSearchUrl(query: string, location: string | undefined, page: number): string {
  const combined = location ? `${query} ${location}` : query
  const params = new URLSearchParams({ palabra: combined })
  if (page > 1) params.set("page", String(page))
  return `${BASE_URL}/empregos.aspx?${params.toString()}`
}

/** Build the fragment-API URL used for page 2+ (see url-reference.md). */
export function fragmentUrl(searchUrl: string): string {
  return `${FRAGMENT_URL}?url=${encodeURIComponent(searchUrl)}`
}

/**
 * Fetch the results HTML for a given page. Page 1 is a normal page fetch; page 2+
 * goes through InfoJobs' own infinite-scroll fragment endpoint, which returns
 * { eof, listFragmentHTML } as JSON.
 */
export async function fetchResultsHtml(searchUrl: string, page: number): Promise<string> {
  if (page <= 1) return httpFetch(searchUrl)
  const raw = await httpFetch(fragmentUrl(searchUrl))
  if (!raw) return ""
  try {
    const data = JSON.parse(raw)
    return typeof data.listFragmentHTML === "string" ? data.listFragmentHTML : ""
  } catch {
    return ""
  }
}

/**
 * Parse the search-results markup: one card per
 * `<div id="vacancy<id>" ... data-id="<id>" class="... js_rowCard js_cardLink" data-href="<url>">`.
 * We locate each card's opening tag with a global regex (id + href are on that single
 * tag) and scope the rest of the parse to the slice between this card's tag and the
 * next one, so a malformed card cannot break the rest.
 */
export function parseOfferCards(html: string): JobCard[] {
  const results: JobCard[] = []
  // The "verified employer" badge carries a tooltip whose data-bs-title/title
  // attribute VALUES contain literal, HTML-escaped "<div>...</div>" markup
  // describing the badge itself. A naive substring search for "</div>" (used
  // below to bound the company block) matches that fake closing tag inside the
  // attribute string before it reaches the real one. Strip both attributes
  // globally first — their values are double-quoted with no literal `"`
  // inside (nested markup uses single quotes), so this is safe.
  const sanitized = html.replace(/\s(?:data-bs-title|title)="[^"]*"/gi, "")
  const cardRe = /<div id="vacancy(\d+)"[^>]*data-href="([^"]+)"[^>]*>/g
  const starts: { id: string; href: string; index: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = cardRe.exec(sanitized)) !== null) {
    starts.push({ id: m[1], href: m[2], index: m.index, end: m.index + m[0].length })
  }

  for (let i = 0; i < starts.length; i++) {
    const { id, href, end } = starts[i]
    const chunkEnd = i + 1 < starts.length ? starts[i + 1].index : sanitized.length
    const chunk = sanitized.slice(end, chunkEnd)

    const titleMatch = chunk.match(/class="[^"]*js_vacancyTitle[^"]*">\s*([\s\S]*?)\s*<\/h2>/i)
    if (!titleMatch) continue
    const title = clean(titleMatch[1])
    if (!title) continue

    // The company block is either an <a class="text-body text-decoration-none">
    // (named employer, linked) or bare text under <div class="text-body"> ("Empresa"
    // + a nested span reading "confidencial", no link) — match the whole div rather
    // than special-casing the two shapes.
    let company: string | null = null
    const companyMatch = chunk.match(/<div class="text-body">([\s\S]*?)<\/div>/i)
    if (companyMatch) company = clean(companyMatch[1]) || null

    let location: string | null = null
    const locMatch = chunk.match(/<div class="mb-8">\s*([^<]+)/i)
    if (locMatch) location = clean(locMatch[1]) || null

    let date: string | null = null
    const dateMatch = chunk.match(/class="js_date" data-value="([^"]+)"/i)
    if (dateMatch) date = dateMatch[1].slice(0, 10).replace(/\//g, "-") || null

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`
    results.push({ id, title, company, location, date, url })
  }

  return results
}

/** Parse the trailing numeric ID out of a raw ID or an InfoJobs job URL (`...__<id>.aspx`). */
export function normalizeId(input: string): string | null {
  const m = input.match(/__(\d+)\.aspx/i) || input.match(/(\d{5,})/)
  return m ? m[1] : null
}

/**
 * Parse a job-detail page. InfoJobs embeds the full posting as a schema.org
 * JobPosting JSON-LD block, more reliable than scraping the rendered HTML.
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

  let description: string | null = null
  if (typeof data.description === "string") {
    description = decodeHtmlEntities(
      data.description.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "),
    )
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  return {
    id,
    title: data.title ?? "(untitled)",
    company: data.hiringOrganization?.name ?? null,
    location,
    date: typeof data.datePosted === "string" ? data.datePosted.slice(0, 10) : null,
    url: `${BASE_URL}/vaga-de-vaga__${id}.aspx`,
    description,
    employmentType: data.employmentType ?? null,
    validThrough: typeof data.validThrough === "string" ? data.validThrough.slice(0, 10) : null,
  }
}
