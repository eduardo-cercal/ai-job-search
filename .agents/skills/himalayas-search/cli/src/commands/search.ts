import { FEED_URL, feedFetch, filterCardsByQuery, parseFeedItems, writeError, type JobDetail } from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage?: number // days; client-side filter over each item's real pubDate
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobDetail[]): string {
  if (cards.length === 0) return "No results."
  // The id is the full "company-slug/job-slug" composite and is never truncated here
  // - a cut-off id silently produces a different, wrong id when pasted into `detail`.
  const idWidth = Math.max(2, ...cards.map((c) => c.id.length))
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "Worldwide").slice(0, 20).padEnd(20)
    const date = c.date || "—"
    return `${c.id.padEnd(idWidth)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(idWidth) + " " + "TITLE".padEnd(40) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(20) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const xml = await feedFetch(FEED_URL)
    let cards = filterCardsByQuery(parseFeedItems(xml), opts.query)

    if (opts.location) {
      const needle = opts.location.toLowerCase()
      cards = cards.filter((c) => (c.location || "").toLowerCase().includes(needle))
    }

    if (opts.jobage !== undefined) {
      const cutoff = Date.now() - opts.jobage * 86400_000
      cards = cards.filter((c) => {
        if (!c.date) return false
        return new Date(`${c.date}T00:00:00Z`).getTime() >= cutoff
      })
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    // search output omits the full description (detail's job) - keep the lightweight shape
    const results = cards.map(({ description: _description, ...rest }) => rest)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        results
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "Worldwide"} · ${c.date || "—"}${c.deadline ? ` · closes ${c.deadline}` : ""}\n  categories: ${c.categories || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: results.length, page: 1 }, results }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
