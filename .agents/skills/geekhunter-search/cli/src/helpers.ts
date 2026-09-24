// Data source: GeekHunter's public /pt/vagas job-search page (a Brazil tech-recruiting
// board) and its individual job-detail pages. No authentication required for either.
//
// The search-results page embeds its job data as a JSON blob inside a Next.js RSC
// streaming chunk (escaped once via JSON.stringify), rather than clean JSON-LD. We
// locate and double-unescape it with a balanced-brace scan (see extractSearchBlob).
// Detail pages carry a clean schema.org JobPosting JSON-LD block, which robots.txt
// explicitly names as "the surface meant for discovery" over the site's own (and
// disallowed) /api/ routes - see url-reference.md.

export const SEARCH_URL = "https://www.geekhunter.com/pt/vagas"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; geekhunter-search-cli/1.0)"

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
  experienceLevel: string | null
  workModality: string | null
  salary: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  skills: string | null
  deadline: string | null
}

/**
 * Extract the escaped `{"data":[...],"meta":{...}}` blob the search-results page
 * streams inside a Next.js RSC chunk, and return the parsed object.
 *
 * The blob is JSON-escaped once (it is embedded as a string value inside the outer
 * HTML response's own flight-protocol payload), so it must be unescaped via
 * `JSON.parse('"' + escaped + '"')` before a second `JSON.parse` yields the real
 * object. Braces are never escaped by JSON string encoding, so a plain depth
 * counter safely finds the matching close even while scanning through the
 * surrounding escaped quotes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSearchBlob(html: string): { data: any[]; meta: Record<string, unknown> } | null {
  const anchor = '{\\"data\\":['
  const anchorIdx = html.indexOf(anchor)
  if (anchorIdx === -1) return null

  let depth = 0
  let start = -1
  let end = -1
  for (let i = anchorIdx; i < html.length; i++) {
    const c = html[i]
    if (c === "{") {
      if (depth === 0) start = i
      depth++
    } else if (c === "}") {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (start === -1 || end === -1) return null

  const escaped = html.slice(start, end)
  try {
    const unescaped = JSON.parse(`"${escaped}"`) as string
    const parsed = JSON.parse(unescaped)
    return { data: Array.isArray(parsed.data) ? parsed.data : [], meta: parsed.meta ?? {} }
  } catch {
    return null
  }
}

/**
 * Best-effort human-readable company name derived from GeekHunter's internal slug
 * (e.g. "nava-technology-for-business-1" -> "Nava Technology For Business").
 *
 * This is NOT a verified display name. The search-results payload only carries the
 * slug, which is often the full legal entity name rather than the brand name a
 * candidate would recognize (slug "bebee-tecnologia-da-informacao-ltda" vs. the real
 * name "Bebee"). Run `detail` on a promising result for the authoritative company
 * name from that posting's own JobPosting structured data (`hiringOrganization.name`).
 */
export function humanizeSlug(slug: string): string {
  const stripped = slug.replace(/-\d+$/, "")
  return stripped
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

const MODALITY_LABEL: Record<string, string> = {
  remote: "Remote",
  "remote-in-city": "Remote (city-tied)",
  hybrid: "Hybrid",
  "on-site": "On-site",
}

function formatLocation(workModality: string | null, cityNames: string[]): string | null {
  const cityPart = cityNames.length > 0 ? cityNames.join("; ") : null
  const label = workModality ? (MODALITY_LABEL[workModality] ?? workModality) : null
  if (cityPart && label) return `${cityPart} (${label})`
  return cityPart ?? label
}

interface SalaryLike {
  minSalary?: number | null
  maxSalary?: number | null
  minValue?: number | null
  maxValue?: number | null
  currency?: string | null
  contractType?: string | null
  currencyRef?: { symbol?: string | null } | null
}

function formatSalary(salaries: SalaryLike[] | undefined): string | null {
  if (!salaries || salaries.length === 0) return null
  const s = salaries[0]
  const symbol = s.currencyRef?.symbol || s.currency || ""
  const min = s.minSalary ?? s.minValue
  const max = s.maxSalary ?? s.maxValue
  if (min == null && max == null) {
    return s.contractType ? `${s.contractType} (salary not disclosed)` : null
  }
  if (min != null && max != null) return `${symbol} ${min}-${max}/mo`.trim()
  if (min != null) return `${symbol} ${min}+/mo`.trim()
  return `up to ${symbol} ${max}/mo`.trim()
}

/** Parse one `PublicJob` entry from the search blob into a JobCard. Returns null for a
 * malformed entry so one bad card cannot break the rest of the page. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePublicJob(job: any): JobCard | null {
  try {
    const atsJob = job?.atsJob
    const detail = atsJob?.atsJobDetail
    const companySlug: string | undefined = atsJob?.company?.slug
    const jobSlug: string | undefined = atsJob?.jobSlug
    if (!atsJob || !detail || !companySlug || !jobSlug) return null

    const publishedAtMs = Number(atsJob.publishedAt)
    const date = Number.isFinite(publishedAtMs) ? new Date(publishedAtMs).toISOString().slice(0, 10) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cityNames: string[] = (detail.atsJobCities || []).map((c: any) => c.name).filter(Boolean)

    return {
      id: `${companySlug}/${jobSlug}`,
      title: detail.title ? String(detail.title).trim() : "(untitled)",
      company: humanizeSlug(companySlug),
      location: formatLocation(detail.workModality ?? null, cityNames),
      date,
      url: `https://www.geekhunter.com/pt/${companySlug}/jobs/${jobSlug}`,
      experienceLevel: detail.experienceLevel ?? null,
      workModality: detail.workModality ?? null,
      salary: formatSalary(detail.atsJobSalaries),
    }
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

/** Parse the `<script type="application/ld+json">` JobPosting block on a detail page.
 * Returns null if no JobPosting block is found (the page markup changed, or the
 * posting was pulled). */
export function parseJobDetail(html: string, id: string, url: string): JobDetail | null {
  const blockRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let posting: any = null
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1])
      if (parsed["@type"] === "JobPosting") {
        posting = parsed
        break
      }
    } catch {
      continue
    }
  }
  if (!posting) return null

  let location: string | null = null
  if (Array.isArray(posting.jobLocation) && posting.jobLocation.length > 0) {
    location = posting.jobLocation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((l: any) => {
        const a = l.address || {}
        const locality: string | undefined = a.addressLocality
        const region: string | undefined = a.addressRegion
        // addressLocality often already embeds the region (e.g. "São Paulo, SP"),
        // so only append addressRegion when it isn't already present verbatim.
        const includesRegion = Boolean(region && locality && locality.includes(region))
        return [locality, includesRegion ? null : region].filter(Boolean).join(", ")
      })
      .filter(Boolean)
      .join("; ") || null
  } else if (posting.jobLocationType === "TELECOMMUTE") {
    location = "Remote"
  }

  let salary: string | null = null
  if (posting.baseSalary?.value) {
    const v = posting.baseSalary.value
    salary = formatSalary([
      { minSalary: v.minValue, maxSalary: v.maxValue, currency: posting.baseSalary.currency },
    ])
  }

  const withBreaks = String(posting.description || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const description =
    decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim() || null

  const monthsExp = posting.experienceRequirements?.monthsOfExperience
  const experienceLevel = typeof monthsExp === "number" ? `${Math.round(monthsExp / 12)}+ years` : null

  return {
    id,
    title: posting.title ? String(posting.title).trim() : "(untitled)",
    company: posting.hiringOrganization?.name ?? null,
    location,
    date: posting.datePosted ?? null,
    url,
    experienceLevel,
    workModality: posting.jobLocationType === "TELECOMMUTE" ? "remote" : null,
    salary,
    description,
    employmentType: Array.isArray(posting.employmentType) ? posting.employmentType.join(", ") : (posting.employmentType ?? null),
    skills: posting.skills ?? null,
    deadline: typeof posting.validThrough === "string" ? posting.validThrough.slice(0, 10) : null,
  }
}

const VALID_MODALITIES = new Set(["remote", "remote-in-city", "hybrid", "on-site"])

/** Normalize a comma-separated --remote value against GeekHunter's own workModality
 * vocabulary. Returns null if any part is not recognized. Accepts "onsite" as an
 * alias for "on-site" to match this repo's other portal CLIs. */
export function workModalityFlag(mode: string | undefined): string | null {
  if (!mode) return null
  const parts = mode.split(",").map((p) => {
    const t = p.trim().toLowerCase()
    return t === "onsite" ? "on-site" : t
  })
  for (const p of parts) if (!VALID_MODALITIES.has(p)) return null
  return parts.join(",")
}

const VALID_EXPERIENCE_LEVELS = new Set([
  "intern", "assistent", "entry", "mid", "senior", "coordinator", "manager", "director", "executive",
])

/** Normalize a comma-separated --experience-level value against GeekHunter's own
 * seniority vocabulary. Returns null if any part is not recognized. */
export function experienceLevelFlag(level: string | undefined): string | null {
  if (!level) return null
  const parts = level.split(",").map((p) => p.trim().toLowerCase())
  for (const p of parts) if (!VALID_EXPERIENCE_LEVELS.has(p)) return null
  return parts.join(",")
}
