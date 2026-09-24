// Data source: We Work Remotely's public combined-categories RSS feed
// (weworkremotely.com/remote-jobs.rss). No authentication.
//
// IMPORTANT — every ordinary HTML page on this site (homepage, /remote-jobs/search,
// individual job pages) returned an HTTP 403 Cloudflare JS-challenge ("Just a moment...")
// for this CLI's honest, non-browser User-Agent — confirmed live, and not something this
// CLI works around by spoofing browser headers (that escalation path is gated behind
// .claude/skills/job-application-assistant/09-web-research.md, not a portal CLI's
// default). The `.rss` feed endpoints are the one thing that returned real content
// (HTTP 200) with the exact same honest UA, so this skill uses the combined feed as its
// only data source rather than guessing at a workaround for the blocked HTML pages.
//
// The combined feed has no query/keyword parameter and no real pagination (`?page=2`
// probed live and confirmed byte-identical to no page param at all, fetched
// back-to-back to rule out the feed simply refreshing between requests) — it always
// returns the latest ~10 postings from each of ~10 categories (~90 items total).
// --query is a client-side filter over each item's company, title, and description text.
//
// There is also no separate HTML detail page reachable by this CLI (same 403 as above).
// Because the RSS item already embeds the full job description, `detail` re-fetches the
// same feed and looks up the item by its own link/guid rather than fetching a second
// page — see commands/detail.ts. This only finds postings still present in the feed's
// rolling window; an older posting that has scrolled out returns NOT_FOUND, not a parse
// failure.

export const BASE_URL = "https://weworkremotely.com"
export const FEED_URL = `${BASE_URL}/remote-jobs.rss`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; weworkremotely-search-cli/1.0)"

/** Fetch with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function feedFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
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
  location: string | null // the feed's own <region> field, e.g. "Anywhere in the World", "USA Only"
  date: string | null
  url: string
  category: string | null // WWR's own job-function category, e.g. "Full-Stack Programming"
  skills: string | null // WWR's own free-text skills field, e.g. "Node.js, React, Mobile, React Native"
  employmentType: string | null // the feed's own <type> field, e.g. "Full-Time", "Contract"
}

export interface JobDetail extends JobCard {
  description: string | null
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

/** Parse WWR's RFC-2822 pubDate ("Mon, 17 Aug 2026 19:21:19 +0000") into an ISO date. */
export function parsePubDate(text: string | null): string | null {
  if (!text) return null
  const ms = Date.parse(text)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Strip an RSS <description> value down to readable plain text. The raw field is
 * RSS/XML-escaped HTML (so it needs decoding twice: once to reveal the real HTML tags,
 * and once more after stripping them, because the original HTML itself contains entities
 * like &amp;nbsp; and &amp;amp; that only resolve on the second pass).
 */
function cleanDescription(raw: string): string {
  const html = decodeHtmlEntities(raw)
  const stripped = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
  return decodeHtmlEntities(stripped)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \n]+|[ \n]+$/g, "")
}

/** Extract the trailing slug from a WWR job URL, used as this skill's `id`. */
function slugFromUrl(url: string): string {
  const m = url.match(/\/remote-jobs\/([^/?#]+)/)
  return m ? m[1] : url
}

/**
 * Parse the combined RSS feed into job listings (always including the cleaned
 * description — one pass, so there is no risk of a skipped-item index mismatch between
 * a "cards" parse and a separate "descriptions" parse). Each <item> is well-formed,
 * non-nested RSS, so a single non-greedy match per item (rather than chunk-splitting on
 * a marker string, the approach used for HTML card-based portals in this repo) is safe
 * here. `search` and `detail` both call this and pick the fields they need.
 */
export function parseFeedItems(xml: string): JobDetail[] {
  const results: JobDetail[] = []
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []

  for (const item of items) {
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i)
    if (!linkMatch) continue
    const url = clean(linkMatch[1])
    if (!url) continue

    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i)
    if (!titleMatch) continue
    const rawTitle = clean(titleMatch[1])
    if (!rawTitle) continue

    // WWR's own title format is consistently "Company: Role" (confirmed live across
    // every item in the combined feed) — split on the first ": " only, since the role
    // portion can itself contain further punctuation.
    const sep = rawTitle.indexOf(": ")
    const company = sep === -1 ? null : rawTitle.slice(0, sep)
    const title = sep === -1 ? rawTitle : rawTitle.slice(sep + 2)

    const regionMatch = item.match(/<region>([\s\S]*?)<\/region>/i)
    const location = regionMatch ? clean(regionMatch[1]) || null : null

    const categoryMatch = item.match(/<category>([\s\S]*?)<\/category>/i)
    const category = categoryMatch ? clean(categoryMatch[1]) || null : null

    const skillsMatch = item.match(/<skills>([\s\S]*?)<\/skills>/i)
    const skills = skillsMatch ? clean(skillsMatch[1]) || null : null

    const typeMatch = item.match(/<type>([\s\S]*?)<\/type>/i)
    const employmentType = typeMatch ? clean(typeMatch[1]) || null : null

    const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)
    const date = pubDateMatch ? parsePubDate(clean(pubDateMatch[1])) : null

    const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i)
    const description = descMatch ? cleanDescription(descMatch[1]) || null : null

    results.push({
      id: slugFromUrl(url),
      title,
      company,
      location,
      date,
      url,
      category,
      skills,
      employmentType,
      description,
    })
  }

  return results
}

/**
 * Client-side query filter: splits the query into words and requires every word to
 * appear, case-insensitively and in any order, across the card's company, title,
 * category, skills, and (when available) description text. Word-level AND matching
 * mirrors programathor-search's filter for the same reason: WWR has no server-side
 * keyword search parameter at all (only a Cloudflare-blocked HTML search page), so this
 * is the best-effort honest substitute — see the module comment. `description` is
 * included deliberately: a live check found a "Senior React Native Developer" posting
 * whose title and skills field both omit "Flutter" entirely, but whose description
 * mentions it (as a nearby/alternative technology) — description text is what makes a
 * query like "flutter" find that listing at all.
 */
export function filterCardsByQuery<T extends JobCard & { description?: string | null }>(
  cards: T[],
  query: string,
): T[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return cards
  return cards.filter((c) => {
    const haystack = `${c.company ?? ""} ${c.title} ${c.category ?? ""} ${c.skills ?? ""} ${c.description ?? ""}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}

/** Extract a WWR job slug from a raw id, a full job URL, or any string containing one. */
export function normalizeId(input: string): string | null {
  const m = input.match(/\/remote-jobs\/([^/?#]+)/)
  if (m) return m[1]
  return /^[a-z0-9-]+$/i.test(input) ? input : null
}
