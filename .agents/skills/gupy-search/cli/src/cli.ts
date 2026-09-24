#!/usr/bin/env bun
// Self-contained CLI for searching Brazil tech-hiring job listings on Gupy's public
// job-search portal (portal.gupy.io). No external CLI framework, so it runs anywhere
// `bun` is available with zero install beyond the repo clone.
//
// robots.txt on portal.gupy.io is fully open (`Disallow:` with no paths), and each
// company's own <subdomain>.gupy.io/job/... detail page only disallows /companies
// and /candidates - never the /job/ paths this CLI fetches. See url-reference.md.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { workplaceTypeFlag } from "./helpers.js"

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

const HELP = `gupy-cli — search Brazil tech-hiring job listings on Gupy

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <subdomain/jobId|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>    Free text keyword search. Recommended.
  --location, -l <text> City name (e.g. "Curitiba"). Sent as Gupy's own city[] filter.
  --state <text>        Brazilian state name (e.g. "Paraná").
  --remote <mode>       remote | hybrid. Comma-separated for "any of". On-site has no
                         confirmed filter value on this portal - see SKILL.md.
  --jobage <days>       Posted within N days - client-side filter (no native param).
  --page <n>            Must be 1 - this portal's search page only ever serves its
                         first page of results (confirmed: neither offset, page, nor
                         limit params change what it returns). See SKILL.md.
  --limit, -n <n>       Cap results emitted (client-side; the portal itself never
                         returns more than 12 per query regardless of this flag).
  --format <fmt>        json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "flutter" --remote remote --format table
  bun run src/cli.ts search -q "desenvolvedor" -l "Curitiba" --state "Paraná" --format table
  bun run src/cli.ts detail grupoboticario/12393296 --format plain

robots.txt permits this - see SKILL.md for the read that established that.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "state", "remote", "jobage", "page", "limit", "format", "help", "h"]),
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
    if (page !== 1) {
      process.stderr.write(
        JSON.stringify({
          error:
            "this portal's search page only ever serves its first page of results - confirmed live that offset, page, and limit request params have no effect on what it returns. Only --page 1 is supported.",
          code: "PAGINATION_UNSUPPORTED",
        }) + "\n",
      )
      return 1
    }

    let limit: number | undefined
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }

    let workplaceType: string | undefined
    if (typeof flags.remote === "string") {
      const normalized = workplaceTypeFlag(flags.remote)
      if (normalized === null) {
        process.stderr.write(
          JSON.stringify({
            error: `--remote must be one or more of remote, hybrid (comma-separated) - on-site has no confirmed filter value on this portal, got "${flags.remote}"`,
            code: "BAD_ARG",
          }) + "\n",
        )
        return 1
      }
      workplaceType = normalized
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      state: typeof flags.state === "string" ? flags.state : undefined,
      workplaceType,
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
        JSON.stringify({ error: "detail requires a <subdomain/jobId|url>", code: "NO_ID" }) + "\n",
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
