import { htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const BASE = "https://www.geekhunter.com/pt"

/** Accept a full GeekHunter job URL (any locale) or a bare "<company-slug>/<job-slug>"
 * composite id (the `id` field `search` returns). */
export function normalizeId(input: string): { companySlug: string; jobSlug: string } | null {
  const urlMatch = input.match(/geekhunter\.com\/(?:pt|en|es)\/([a-z0-9-]+)\/jobs\/([a-z0-9-]+)/i)
  if (urlMatch) return { companySlug: urlMatch[1], jobSlug: urlMatch[2] }
  const bare = input.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/i)
  if (bare) return { companySlug: bare[1], jobSlug: bare[2] }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ids = normalizeId(opts.id)
  if (!ids) {
    writeError(
      `Could not parse a company-slug/job-slug id from "${opts.id}" - pass either a full GeekHunter job URL or the "<company-slug>/<job-slug>" id from search results`,
      "BAD_ID",
    )
    return 1
  }
  const url = `${BASE}/${ids.companySlug}/jobs/${ids.jobSlug}`
  try {
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, `${ids.companySlug}/${ids.jobSlug}`, url)
    if (!job) {
      writeError("Could not find JobPosting structured data on this page - it may have been removed or the markup changed", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.experienceLevel ? `Experience: ${job.experienceLevel}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.deadline ? `Valid through: ${job.deadline}` : "",
        job.skills ? `Skills: ${job.skills}` : "",
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
