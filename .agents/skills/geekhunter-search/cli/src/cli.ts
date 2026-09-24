#!/usr/bin/env bun
// Self-contained CLI for searching Brazil tech-recruiting job listings on GeekHunter's
// public /pt/vagas board. No external CLI framework, so it runs anywhere `bun` is
// available with zero install beyond the repo clone.
//
// robots.txt explicitly permits crawling the search and detail paths this CLI uses
// (Content-Signal: search=yes) and its own comments point crawlers at exactly this
// surface ("the surface meant for discovery") in preference to its disallowed /api/
// routes - see url-reference.md for the full read.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { workModalityFlag, experienceLevelFlag } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `geekhunter-cli — search Brazil tech-recruiting job listings on GeekHunter

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <company-slug/job-slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>        Free text - matched against job title, then skills, then
                             description, in that order of relevance (GeekHunter's own
                             documented ranking). Recommended.
  --location, -l <text>     Exact city name as written on the job, accents included
                             (e.g. "São Paulo, SP", "Florianópolis"). Verbatim match -
                             only useful for on-site/hybrid postings that name a city.
  --remote <mode>           remote | remote-in-city | hybrid | onsite (alias for
                             on-site). Comma-separated for "any of".
  --experience-level <lv>   intern | assistent | entry | mid | senior | coordinator |
                             manager | director | executive. Comma-separated for "any of".
  --jobage <days>           Posted within N days - client-side filter (no native param).
  --page <n>                1-indexed page (25 results/page). Default 1.
  --limit, -n <n>           Cap results emitted (client-side).
  --format <fmt>            json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "flutter" --remote remote --format table
  bun run src/cli.ts search -q "desenvolvedor mobile" --experience-level senior --format table
  bun run src/cli.ts search -q "flutter" -l "São Paulo, SP" --remote hybrid,onsite --format table
  bun run src/cli.ts detail nava-technology-for-business-1/desenvolvedor-flutter-senior-4 --format plain

robots.txt permits this - see SKILL.md for the read that established that.
`

// Long-form flag names each command accepts (parseFlags resolves the short aliases
// q/l/n to these before validation). "help"/"h" pass so `search --help` still prints
// usage.
const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "location", "remote", "experience-level", "jobage", "page", "limit", "format", "help", "h",
  ]),
  detail: new Set(["format", "help", "h"]),
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Reject unknown flags instead of silently discarding them: a discarded filter
  // changes what the search returns with no error.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      process.stderr.write(
        JSON.stringify({
          error: `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
          code: "UNKNOWN_FLAG",
        }) + "\n",
      )
      return 1
    }
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      // Number(), not parseInt(): parseInt truncates, silently accepting fractional input.
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a whole number of at least 1, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }

    let jobage: number | undefined
    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      jobage = v
    }

    let page = 1
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      page = v
    }

    let limit: number | undefined
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }

    let workModality: string | undefined
    if (typeof flags.remote === "string") {
      const normalized = workModalityFlag(flags.remote)
      if (normalized === null) {
        process.stderr.write(
          JSON.stringify({
            error: `--remote must be one or more of remote, remote-in-city, hybrid, onsite/on-site (comma-separated), got "${flags.remote}"`,
            code: "BAD_ARG",
          }) + "\n",
        )
        return 1
      }
      workModality = normalized
    }

    let experienceLevel: string | undefined
    if (typeof flags["experience-level"] === "string") {
      const normalized = experienceLevelFlag(flags["experience-level"] as string)
      if (normalized === null) {
        process.stderr.write(
          JSON.stringify({
            error: `--experience-level must be one or more of intern, assistent, entry, mid, senior, coordinator, manager, director, executive (comma-separated), got "${flags["experience-level"]}"`,
            code: "BAD_ARG",
          }) + "\n",
        )
        return 1
      }
      experienceLevel = normalized
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      workModality,
      experienceLevel,
      jobage,
      page,
      limit,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires a <company-slug/job-slug|url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
