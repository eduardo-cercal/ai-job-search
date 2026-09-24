import { htmlFetch, extractNextData, parseGupyDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a full Gupy job URL (any company subdomain) or a bare "<subdomain>/<jobId>"
 * composite id (the `id` field `search` returns). A bare id reconstructs the job
 * token Gupy itself base64-encodes into its URLs (`{"jobId":<n>,"source":"gupy_portal"}`)
 * - verified to round-trip against a live posting during scaffolding. */
export function normalizeId(input: string): { url: string } | null {
  if (/^https?:\/\/[a-z0-9-]+\.gupy\.io\/job\//i.test(input)) {
    return { url: input }
  }
  const bare = input.match(/^([a-z0-9-]+)\/(\d+)$/i)
  if (bare) {
    const [, subdomain, jobId] = bare
    const token = Buffer.from(JSON.stringify({ jobId: Number(jobId), source: "gupy_portal" })).toString("base64")
    return { url: `https://${subdomain}.gupy.io/job/${token}` }
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const normalized = normalizeId(opts.id)
  if (!normalized) {
    writeError(
      `Could not parse a subdomain/jobId id from "${opts.id}" - pass either a full Gupy job URL or the "<subdomain>/<jobId>" id from search results`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const html = await htmlFetch(normalized.url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const nextData = extractNextData(html)
    const job = nextData ? parseGupyDetail(nextData, opts.id, normalized.url) : null
    if (!job) {
      writeError("Could not find job data in this page's __NEXT_DATA__ - it may have been removed or the markup changed", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.deadline ? `Application deadline: ${job.deadline}` : "",
        "",
        job.description || "(no description)",
        job.prerequisites ? `\nRequirements:\n${job.prerequisites}` : "",
        job.responsibilities ? `\nResponsibilities:\n${job.responsibilities}` : "",
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
