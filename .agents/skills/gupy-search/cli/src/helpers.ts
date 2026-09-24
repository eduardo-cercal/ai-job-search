// Data source: Gupy's public job-search portal at portal.gupy.io and each job's own
// per-company subdomain detail page (<subdomain>.gupy.io/job/<token>). No
// authentication required for either. Both pages embed their data as a plain Next.js
// `__NEXT_DATA__` JSON blob - no escaping trick needed here (contrast with
// geekhunter-search, whose search page embeds an extra layer of JSON-string escaping).

export const SEARCH_BASE = "https://portal.gupy.io/job-search"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; gupy-search-cli/1.0)"

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
  deadline: string | null
  url: string
  workplaceType: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  prerequisites: string | null
  responsibilities: string | null
}

/** Extract and parse the `__NEXT_DATA__` JSON blob every Gupy page embeds. Unlike
 * geekhunter-search's RSC payload, this is a standard Next.js Pages Router data
 * script: plain, unescaped JSON, one `JSON.parse` away. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractNextData(html: string): any | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

/** Strip HTML tags from a rich-text field, keeping block-level breaks as newlines. */
export function cleanHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = String(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const cleaned = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim()
  return cleaned || null
}

const MODALITY_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
}

function formatLocation(workplaceType: string | null, city: string, state: string): string | null {
  const place = [city, state].filter(Boolean).join(", ") || null
  const label = workplaceType ? (MODALITY_LABEL[workplaceType] ?? workplaceType) : null
  if (place && label) return `${place} (${label})`
  return place ?? label
}

/** Extract the `<subdomain>` from a Gupy job URL, e.g.
 * "https://grupoboticario.gupy.io/job/<token>?jobBoardSource=..." -> "grupoboticario". */
export function subdomainFromUrl(url: string): string | null {
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.gupy\.io\//i)
  return m ? m[1] : null
}

/** Parse one job record from the search page's `initialJobList.data` array. Returns
 * null for a malformed entry so one bad card cannot break the rest of the page. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGupyJob(job: any): JobCard | null {
  try {
    if (!job || typeof job.id !== "number" || !job.name || !job.jobUrl) return null
    const subdomain = subdomainFromUrl(job.jobUrl)
    return {
      id: subdomain ? `${subdomain}/${job.id}` : String(job.id),
      title: String(job.name).trim(),
      company: job.careerPageName ?? null,
      location: formatLocation(job.workplaceType ?? null, job.city ?? "", job.state ?? ""),
      date: typeof job.publishedDate === "string" ? job.publishedDate.slice(0, 10) : null,
      deadline: typeof job.applicationDeadline === "string" ? job.applicationDeadline.slice(0, 10) : null,
      url: job.jobUrl,
      workplaceType: job.workplaceType ?? null,
    }
  } catch {
    return null
  }
}

/** Parse the `job` object from a detail page's `__NEXT_DATA__` blob. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseGupyDetail(nextData: any, id: string, url: string): JobDetail | null {
  const job = nextData?.props?.pageProps?.job
  if (!job || typeof job.id !== "number" || !job.name) return null

  return {
    id,
    title: String(job.name).trim(),
    company: job.careerPage?.name ?? null,
    location: formatLocation(job.workplaceType ?? null, job.addressCity ?? "", job.addressState ?? ""),
    date: typeof job.publishedAt === "string" ? job.publishedAt.slice(0, 10) : null,
    deadline: typeof job.expiresAt === "string" ? job.expiresAt.slice(0, 10) : null,
    url,
    workplaceType: job.workplaceType ?? null,
    description: cleanHtml(job.description),
    prerequisites: cleanHtml(job.prerequisites),
    responsibilities: cleanHtml(job.responsibilities),
  }
}

const VALID_WORKPLACE_TYPES = new Set(["remote", "hybrid"])

/** Normalize a comma-separated --remote value against Gupy's confirmed workplaceType
 * vocabulary. Returns null if any part is not recognized.
 *
 * Only "remote" and "hybrid" are confirmed working - Gupy's on-site equivalent value
 * could not be determined (every candidate tried - on_site, onsite, presencial,
 * on-site, in_person, office - silently returned zero results rather than erroring,
 * which is Gupy's own behavior, not a sign the guess was merely close). Rather than
 * ship a guess that might silently zero out a real search, on-site filtering is
 * intentionally unsupported here - see SKILL.md. */
export function workplaceTypeFlag(mode: string | undefined): string | null {
  if (!mode) return null
  const parts = mode.split(",").map((p) => p.trim().toLowerCase())
  for (const p of parts) if (!VALID_WORKPLACE_TYPES.has(p)) return null
  return parts.join(",")
}
