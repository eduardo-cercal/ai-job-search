import { FEED_URL, feedFetch, normalizeId, parseFeedItems, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * There is no separate HTML detail page this CLI can reach (every ordinary page 403s
 * behind a Cloudflare JS challenge for an honest UA — see the module comment in
 * helpers.ts). Instead, this re-fetches the same combined RSS feed — which already
 * embeds each item's full description — and looks up the requested job by its own
 * link/guid slug. This only finds a posting that is still present in the feed's rolling
 * window (the latest ~10 per category, ~90 total); an older posting that has scrolled
 * out of the feed returns NOT_FOUND, which does not mean the posting is gone from the
 * site, only that this skill's one data source no longer carries it.
 */
export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job id/slug from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const xml = await feedFetch(FEED_URL)
    const items = parseFeedItems(xml)
    const job = items.find((j) => j.id === id)
    if (!job) {
      writeError(
        `No job with id/slug "${id}" found in the current combined-feed window (latest ~90 postings across all categories) — it may have scrolled out, or never existed`,
        "NOT_FOUND",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.category ? `Category: ${job.category}` : "",
        job.employmentType ? `Type: ${job.employmentType}` : "",
        job.skills ? `Skills: ${job.skills}` : "",
        job.date ? `Posted: ${job.date}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
