import { writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
}

/**
 * There is no working `detail` command for ProgramaThor. Every job detail page
 * (/jobs/<id>-<slug>) returned a genuine site-side HTTP 500 at the time this skill was
 * built — confirmed live across multiple job ids, a browser-like User-Agent, and a
 * trailing-slash/.json variant of the URL. This is ProgramaThor's own bug, not a
 * bot-detection response or a gap in this CLI's parsing, so there is nothing to parse
 * around. Rather than silently returning broken or empty data, this command fails loudly
 * and explains why — re-run `/add-portal` on programathor.com.br later to check whether
 * the site has fixed it.
 */
export async function runDetail(_opts: DetailOpts): Promise<number> {
  writeError(
    "ProgramaThor's job detail pages (/jobs/<id>-<slug>) return a site-side HTTP 500 for every job id " +
      "(confirmed live, not specific to this CLI or its User-Agent) — there is no working detail command " +
      "for this portal. Use 'search' output (title, company, location, tags) instead.",
    "DETAIL_UNSUPPORTED",
  )
  return 1
}
