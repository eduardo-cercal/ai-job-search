// Data source: trampos.co's public JSON API, discovered by reading its Ember.js
// app bundle (the site itself server-renders only a static "featured jobs"
// fallback in a <noscript> block - real search results are fetched client-side).
// No authentication required for either endpoint.

export const API_BASE = "https://www.trampos.co/api/v2/opportunities"
export const DETAIL_PAGE_BASE = "https://www.trampos.co/oportunidades"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; trampos-search-cli/1.0)"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch(url: string): Promise<unknown> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
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
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
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
  category: string | null
  type: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  prerequisite: string | null
  desirable: string | null
  perks: string | null
  salary: string | null
  regime: string | null
}

function formatLocation(city: string | undefined, state: string | undefined, hybrid: boolean | undefined, homeOffice: boolean | undefined): string | null {
  const place = [city, state].filter(Boolean).join(", ") || null
  if (homeOffice) return place ? `${place} (Home Office)` : "Home Office"
  if (hybrid) return place ? `${place} (Hybrid)` : "Hybrid"
  return place
}

interface RawOpportunity {
  id: number
  name: string
  city?: string
  state?: string
  hybrid?: boolean
  home_office?: boolean
  published_at?: string
  category_name?: string | null
  type_name?: string | null
  company?: { name?: string | null } | null
  description?: string | null
  prerequisite?: string | null
  desirable?: string | null
  perks?: string | null
  salary?: string | null
  regime?: string | null
}

/** Parse one opportunity record from the search API into a JobCard. Returns null for
 * a malformed entry so one bad record cannot break the rest of the page. */
export function parseOpportunity(job: RawOpportunity): JobCard | null {
  try {
    if (!job || typeof job.id !== "number" || !job.name) return null
    return {
      id: String(job.id),
      title: String(job.name).trim(),
      company: job.company?.name ?? null,
      location: formatLocation(job.city, job.state, job.hybrid, job.home_office),
      date: typeof job.published_at === "string" ? job.published_at.slice(0, 10) : null,
      url: `${DETAIL_PAGE_BASE}/${job.id}`,
      category: job.category_name ?? null,
      type: job.type_name ?? null,
    }
  } catch {
    return null
  }
}

/** Parse the `opportunity` object from the detail API's response. */
export function parseOpportunityDetail(payload: unknown, id: string): JobDetail | null {
  const job = (payload as { opportunity?: RawOpportunity })?.opportunity
  if (!job || typeof job.id !== "number" || !job.name) return null

  return {
    id,
    title: String(job.name).trim(),
    company: job.company?.name ?? null,
    location: formatLocation(job.city, job.state, job.hybrid, job.home_office),
    date: typeof job.published_at === "string" ? job.published_at.slice(0, 10) : null,
    url: `${DETAIL_PAGE_BASE}/${job.id}`,
    category: job.category_name ?? null,
    type: job.type_name ?? null,
    description: job.description?.trim() || null,
    prerequisite: job.prerequisite?.trim() || null,
    desirable: job.desirable?.trim() || null,
    perks: job.perks?.trim() || null,
    salary: job.salary && job.salary !== "NÃO DIVULGADA" ? job.salary : null,
    regime: job.regime && job.regime !== "INDIFERENTE" ? job.regime : null,
  }
}

const VALID_TYPES = new Set(["emprego", "estagio", "banco-talentos"])

/** Normalize a comma-separated --type value against trampos's confirmed opportunity
 * types. Returns null if any part is not recognized. */
export function typeFlag(type: string | undefined): string[] | null {
  if (!type) return null
  const parts = type.split(",").map((p) => p.trim().toLowerCase())
  for (const p of parts) if (!VALID_TYPES.has(p)) return null
  return parts
}
