import { BASE_URL, extractNextData, htmlFetch, normalizeId, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // The title slug is cosmetic — Arc resolves and redirects to the canonical
    // detail URL from the trailing id alone (confirmed live), so any placeholder
    // slug works.
    const html = await htmlFetch(`${BASE_URL}/remote-jobs/j/job-${id}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const nextData = extractNextData(html)
    const job = parseJobDetail(nextData?.props?.pageProps, id)
    if (!job) {
      // Confirmed live: an Arc-native listing's own detail route redirects to the
      // generic /remote-jobs firehose instead of resolving — likely gated behind
      // Arc's own application flow. Aggregated ("external") listings always resolve.
      writeError(
        "Could not load detail for this job. If it came from an arc-native listing " +
          "(source: \"arc\" in search results) rather than an aggregated one " +
          "(source: \"external\"), Arc may require an account to view its full detail page.",
        "DETAIL_UNAVAILABLE",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"} · [${job.source}]`,
        "",
        job.contractType ? `Contract type: ${job.contractType}` : "",
        job.date ? `Posted: ${job.date}` : "",
        job.externalUrl ? `Original posting: ${job.externalUrl}` : "",
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
