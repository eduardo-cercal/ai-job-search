import {
  buildSearchUrl,
  extractNextData,
  htmlFetch,
  parseSearchResults,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  jobage?: number // days; client-side filter (Arc has no server-side date param — see SKILL.md)
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 16).padEnd(16)
    const date = c.date || "—"
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}  [${c.source}]`
  })
  const header =
    "ID".padEnd(11) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(22) +
    " " +
    "LOCATION".padEnd(16) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // Arc's category pages don't paginate beyond the first request (confirmed live:
    // ?page=2 and similar params either get stripped by a canonical redirect or are
    // silently ignored, returning the same first page). Rather than silently
    // re-returning page 1 under a different page number, report no results.
    if (opts.page > 1) {
      if (opts.format === "table") process.stdout.write("No results.\n")
      else if (opts.format === "plain") process.stdout.write("\n")
      else process.stdout.write(JSON.stringify({ meta: { count: 0, page: opts.page }, results: [] }, null, 2) + "\n")
      return 0
    }

    const html = await htmlFetch(buildSearchUrl(opts.query))
    const nextData = extractNextData(html)
    let cards = parseSearchResults(nextData?.props?.pageProps)

    if (opts.jobage !== undefined) {
      const cutoff = Date.now() - opts.jobage * 86400_000
      cards = cards.filter((c) => {
        if (!c.date) return false
        return new Date(`${c.date}T00:00:00Z`).getTime() >= cutoff
      })
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"} · [${c.source}]\n  id: ${c.id}\n  ${c.url}`,
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
