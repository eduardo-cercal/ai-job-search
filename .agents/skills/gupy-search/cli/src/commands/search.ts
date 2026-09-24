import { SEARCH_BASE, htmlFetch, extractNextData, parseGupyJob, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  state?: string
  workplaceType?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** Gupy's search page takes its filters as a single path segment
 * (`/job-search/term=X&city[]=Y`), not a real query string. `city[]` is kept
 * literal (percent-encoded as `%5B%5D`) - confirmed live, not a guess. */
function buildUrl(opts: SearchOpts): string {
  const parts: string[] = []
  if (opts.query) parts.push(`term=${encodeURIComponent(opts.query)}`)
  if (opts.location) parts.push(`city%5B%5D=${encodeURIComponent(opts.location)}`)
  if (opts.state) parts.push(`state=${encodeURIComponent(opts.state)}`)
  if (opts.workplaceType) parts.push(`workplaceType=${encodeURIComponent(opts.workplaceType)}`)
  return parts.length > 0 ? `${SEARCH_BASE}/${parts.join("&")}` : `${SEARCH_BASE}/term=`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = c.id.slice(0, 34).padEnd(34)
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const date = c.date || "—"
    return `${id} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(34) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(20) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    const nextData = extractNextData(html)
    const jobList = nextData?.props?.pageProps?.initialJobList
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cards: JobCard[] = Array.isArray(jobList?.data)
      ? jobList.data.map(parseGupyJob).filter((c: JobCard | null): c is JobCard => c !== null)
      : []

    // No native recency param confirmed on this portal - filter client-side, same
    // pattern as this repo's other portals lacking one.
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
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}${c.deadline ? ` · deadline ${c.deadline}` : ""}\n  id: ${c.id}\n  ${c.url}`,
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
