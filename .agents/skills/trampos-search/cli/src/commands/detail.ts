import { API_BASE, jsonFetch, parseOpportunityDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a bare numeric id, or a full trampos.co job URL (the slug suffix is
 * cosmetic - the bare id alone resolves the same page, confirmed live). */
export function normalizeId(input: string): string | null {
  const bare = input.match(/^\d+$/)
  if (bare) return input
  const url = input.match(/\/oportunidades\/(\d+)/)
  if (url) return url[1]
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(
      `Could not parse a numeric id from "${opts.id}" - pass either a bare opportunity id or a full trampos.co job URL`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const payload = await jsonFetch(`${API_BASE}/${id}`)
    if (!payload) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseOpportunityDetail(payload, id)
    if (!job) {
      writeError("Could not find opportunity data in this response - the API shape may have changed", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.category ? `Category: ${job.category}` : "",
        job.type ? `Type: ${job.type}` : "",
        job.regime ? `Regime: ${job.regime}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        "",
        job.description || "(no description)",
        job.prerequisite ? `\nRequirements:\n${job.prerequisite}` : "",
        job.desirable ? `\nNice to have:\n${job.desirable}` : "",
        job.perks ? `\nPerks:\n${job.perks}` : "",
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
