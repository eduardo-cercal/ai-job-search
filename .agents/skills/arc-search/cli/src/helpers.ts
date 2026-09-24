// Data source: Arc.dev's public remote-jobs pages (arc.dev). No authentication.
// Arc is a Next.js app that server-renders each page's data into a
// <script id="__NEXT_DATA__"> JSON blob — no separate API call needed, just parse
// that blob out of the fetched HTML. See url-reference.md for the full shape.

export const BASE_URL = "https://arc.dev"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; arc-search-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx, following redirects. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
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
  source: "arc" | "external" // arc: Arc's own listing (detail may require login); external: aggregated, detail always works
}

export interface JobDetail extends JobCard {
  description: string | null
  contractType: string | null
  externalUrl: string | null // the original posting's own URL, for "source" jobs cross-posted from elsewhere
}

/** Slugify a query into Arc's category-tag URL segment (lowercase, hyphenated). */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildSearchUrl(query: string): string {
  return `${BASE_URL}/remote-jobs/${slugify(query)}`
}

export function buildJobUrl(urlString: string, id: string): string {
  return `${BASE_URL}/remote-jobs/j/${urlString}-${id}`
}

/** Extract and JSON.parse the Next.js __NEXT_DATA__ payload embedded in the page. */
export function extractNextData(html: string): any | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

function formatLocation(requiredCountries: unknown): string | null {
  if (!Array.isArray(requiredCountries) || requiredCountries.length === 0) return "Worldwide"
  return requiredCountries.join(", ")
}

function formatDate(postedAt: unknown): string | null {
  if (typeof postedAt !== "number") return null
  return new Date(postedAt * 1000).toISOString().slice(0, 10)
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

/**
 * Arc's job descriptions already use literal newlines for paragraph/list breaks
 * (they read like plain text run through a Markdown-to-HTML pass, with only
 * <strong> for emphasis) — strip tags without collapsing those newlines, unlike a
 * plain \s+-to-" " normalize which would flatten the whole description to one line.
 */
function cleanDescription(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function cardFromRaw(raw: any, source: "arc" | "external"): JobCard | null {
  if (!raw || typeof raw.title !== "string" || typeof raw.urlString !== "string" || typeof raw.randomKey !== "string") {
    return null
  }
  return {
    id: raw.randomKey,
    title: raw.title,
    company: raw.company?.name ?? null,
    location: formatLocation(raw.requiredCountries),
    date: formatDate(raw.postedAt),
    url: buildJobUrl(raw.urlString, raw.randomKey),
    source,
  }
}

/**
 * Parse a fetched category page's pageProps into a job list.
 *
 * Arc redirects an unrecognized category slug to the generic, unfiltered
 * `/remote-jobs` firehose (confirmed live: a nonsense slug and a real-but-uncategorized
 * phrase both land there) rather than a 404 or an empty result. `categoryUrlString` is
 * present and equal to the matched category only on a real category page, and is
 * absent/null on that fallback page — the only reliable way to tell "no such category"
 * apart from "here are jobs" instead of silently returning the whole unfiltered site
 * for every query the way a naive parse would.
 */
export function parseSearchResults(pageProps: any): JobCard[] {
  if (!pageProps || !pageProps.categoryUrlString) return []
  const arcJobs = Array.isArray(pageProps.arcJobs) ? pageProps.arcJobs : []
  const externalJobs = Array.isArray(pageProps.externalJobs) ? pageProps.externalJobs : []
  const cards: JobCard[] = []
  for (const raw of arcJobs) {
    const c = cardFromRaw(raw, "arc")
    if (c) cards.push(c)
  }
  for (const raw of externalJobs) {
    const c = cardFromRaw(raw, "external")
    if (c) cards.push(c)
  }
  return cards
}

/**
 * Extract the job id from a bare id, a full job URL, or a URL/slug ending in
 * "<title-slug>-<id>". The id is always the LAST '-'-delimited segment of the final
 * path component (Arc's own randomKey ids are lowercase alphanumeric, no hyphens).
 */
export function normalizeId(input: string): string | null {
  const lastSegment = input.trim().split("/").filter(Boolean).pop() ?? ""
  const parts = lastSegment.split("-")
  const candidate = parts[parts.length - 1]
  return candidate && /^[a-z0-9]+$/i.test(candidate) ? candidate : null
}

/**
 * Parse a job-detail page's pageProps. Confirmed live: this only resolves for
 * "external" (aggregated) jobs, whose pageProps carries a `job` object with a full
 * description. An Arc-native job's own detail route redirected to the generic
 * `/remote-jobs` listing in every case tested (likely gated behind Arc's own
 * application flow) — pageProps.job is absent there, and callers should treat that
 * as "detail not available for this listing", not a parse failure.
 */
export function parseJobDetail(pageProps: any, id: string): JobDetail | null {
  const job = pageProps?.job
  if (!job) return null
  return {
    id,
    title: job.title ?? "(untitled)",
    company: job.companyName ?? job.company?.name ?? null,
    location: formatLocation(job.requiredCountries),
    date: formatDate(job.postedAt),
    url: buildJobUrl(job.urlString ?? "job", id),
    source: typeof job.url === "string" ? "external" : "arc",
    description: typeof job.description === "string" ? cleanDescription(job.description) : null,
    contractType: job.contractType ?? job.jobType ?? null,
    externalUrl: typeof job.url === "string" ? job.url : null,
  }
}
