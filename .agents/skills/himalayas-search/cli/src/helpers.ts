// Data source: Himalayas' public RSS feed (himalayas.app/jobs/rss). No authentication.
//
// IMPORTANT — every ordinary HTML page on this site (the /jobs search page and
// individual /companies/<slug>/jobs/<slug> detail pages) returned an HTTP 403
// Cloudflare managed-challenge ("Just a moment...") for this CLI's honest,
// non-browser User-Agent — confirmed live, and confirmed to persist even with a full
// browser User-Agent string (it's a JS/TLS challenge, not a UA-string block, so this
// is not something header spoofing fixes; that escalation path is gated behind
// .claude/skills/job-application-assistant/09-web-research.md anyway, not a portal
// CLI's default). The feed URL itself was discovered from the plain, unblocked
// /rss info page (himalayas.app/rss), which links to himalayas.app/jobs/rss — the
// feed endpoint returned real content (HTTP 200) with the same honest UA that every
// other page rejected.
//
// The feed has no query/keyword parameter (?searchQuery=, ?q=, ?category=, ?limit=
// all probed live and confirmed to return the byte-identical 20 items regardless)
// and no pagination - it always returns the latest 20 postings site-wide, refreshed
// continuously. --query is a client-side filter over each item's company, title,
// categories, and description text.
//
// There is also no separate HTML detail page this CLI can reach (same 403 as
// above). Because the RSS item already embeds the full job description
// (<content:encoded>), `detail` re-fetches the same feed and looks up the item by
// its own link/guid slug rather than fetching a second page — see commands/detail.ts.
// This only finds postings still present in the feed's rolling 20-item window; an
// older posting that has scrolled out returns NOT_FOUND, not a parse failure.

export const BASE_URL = "https://himalayas.app"
export const FEED_URL = `${BASE_URL}/jobs/rss`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; himalayas-search-cli/1.0)"

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
  location: string | null // built from himalayasJobs:locationRestriction[]; null means no restriction found (worldwide-eligible)
  date: string | null
  deadline: string | null // himalayasJobs:expiryDate, ISO date
  url: string
  categories: string | null // the feed's own auto-generated tags, comma-joined (can be many per posting)
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

/** Unwrap a `<![CDATA[...]]>` payload if present, else return the raw tag content. */
function unwrapCdata(text: string): string {
  const m = text.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return m ? m[1] : text
}

function clean(text: string): string {
  return decodeHtmlEntities(unwrapCdata(text)).replace(/\s+/g, " ").trim()
}

/** Parse an RFC-2822 pubDate/expiryDate string into a plain ISO date. */
function parseRfc2822Date(text: string | null): string | null {
  if (!text) return null
  const ms = Date.parse(text)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

/** Strip the rich HTML in <content:encoded> down to readable plain text, keeping
 * paragraph/list breaks as newlines. Unlike a plain <description>, this field is
 * NOT RSS/XML-double-escaped inside CDATA - CDATA already protects the raw HTML, so
 * a single tag-strip-and-decode pass is correct here. */
function cleanDescription(raw: string): string {
  const html = unwrapCdata(raw)
  const stripped = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|ul|ol|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
  return decodeHtmlEntities(stripped)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Extract the `<company-slug>/<job-slug>` composite from a Himalayas job URL. */
function idFromUrl(url: string): string {
  const m = url.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/)
  return m ? `${m[1]}/${m[2]}` : url
}

/** Extract every occurrence of a repeated, non-nested XML tag's text content
 * (used for himalayasJobs:locationRestriction and <category>, both of which can
 * appear 0+ times per item). */
function extractAll(item: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "gi")
  const values: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(item)) !== null) {
    const v = clean(m[1])
    if (v) values.push(v)
  }
  return values
}

/**
 * Parse the RSS feed into job listings (always including the cleaned description -
 * one pass, so there is no risk of a skipped-item index mismatch between a "cards"
 * parse and a separate "descriptions" parse). Each <item> is well-formed, non-nested
 * RSS, so a single non-greedy match per item is safe here (matching
 * weworkremotely-search's own approach for the same reason). `search` and `detail`
 * both call this and pick the fields they need.
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
    const title = clean(titleMatch[1])
    if (!title) continue

    const companyMatch = item.match(/<himalayasJobs:companyName>([\s\S]*?)<\/himalayasJobs:companyName>/i)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    const countries = extractAll(item, "himalayasJobs:locationRestriction")
    const location = countries.length > 0 ? countries.join(", ") : null

    const expiryMatch = item.match(/<himalayasJobs:expiryDate>([\s\S]*?)<\/himalayasJobs:expiryDate>/i)
    const deadline = expiryMatch ? parseRfc2822Date(clean(expiryMatch[1])) : null

    const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)
    const date = pubDateMatch ? parseRfc2822Date(clean(pubDateMatch[1])) : null

    const categoryList = extractAll(item, "category")
    const categories = categoryList.length > 0 ? categoryList.join(", ") : null

    const descMatch = item.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)
    const description = descMatch ? cleanDescription(descMatch[1]) || null : null

    results.push({
      id: idFromUrl(url),
      title,
      company,
      location,
      date,
      deadline,
      url,
      categories,
      description,
    })
  }

  return results
}

/**
 * Client-side query filter: splits the query into words and requires every word to
 * appear, case-insensitively and in any order, across the card's company, title,
 * categories, and (when available) description text. Word-level AND matching
 * mirrors weworkremotely-search's/programathor-search's filter for the same reason:
 * this feed has no server-side keyword search parameter at all (only a
 * Cloudflare-blocked HTML search page), so this is the best-effort honest substitute.
 */
export function filterCardsByQuery<T extends JobCard & { description?: string | null }>(
  cards: T[],
  query: string,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return cards
  return cards.filter((c) => {
    const haystack = `${c.company ?? ""} ${c.title} ${c.categories ?? ""} ${c.description ?? ""}`.toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}

/** Extract a Himalayas job's `<company-slug>/<job-slug>` id from a raw id, a full
 * job URL, or any string containing one. */
export function normalizeId(input: string): string | null {
  const m = input.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/)
  if (m) return `${m[1]}/${m[2]}`
  return /^[a-z0-9-]+\/[a-z0-9-]+$/i.test(input) ? input : null
}
