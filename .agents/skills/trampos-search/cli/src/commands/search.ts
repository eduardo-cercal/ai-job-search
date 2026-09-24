import { API_BASE, jsonFetch, parseOpportunity, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  category?: string[]
  type?: string[]
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

interface SearchResponse {
  opportunities?: unknown[]
  pagination?: { total: number; total_pages: number; per_page: number }
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("tr", opts.query)
  if (opts.location) params.set("lc", opts.location)
  if (opts.page > 1) params.set("page", String(opts.page))
  let qs = params.toString()
  // Array params use Rails/jQuery bracket notation (ct[]=x&ct[]=y) - confirmed live
  // against the real API - which URLSearchParams can't express with .set()/.append()
  // for repeated bracketed keys cleanly, so they're appended as raw pairs.
  for (const c of opts.category ?? []) qs += `${qs ? "&" : ""}ct%5B%5D=${encodeURIComponent(c)}`
  for (const t of opts.type ?? []) qs += `${qs ? "&" : ""}tp%5B%5D=${encodeURIComponent(t)}`
  return qs ? `${API_BASE}?${qs}` : API_BASE
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = c.id.padEnd(10)
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = c.date || "—"
    return `${id} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(10) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(22) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const payload = (await jsonFetch(buildUrl(opts))) as SearchResponse | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cards: JobCard[] = Array.isArray(payload?.opportunities)
      ? (payload!.opportunities as any[]).map(parseOpportunity).filter((c): c is JobCard => c !== null)
      : []

    // No native recency param confirmed - filter client-side, same pattern as this
    // repo's other portals lacking one.
    if (opts.jobage !== undefined) {
      const cutoff = Date.now() - opts.jobage * 86400000
      cards = cards.filter((c) => (c.date ? new Date(c.date).getTime() >= cutoff : true))
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
