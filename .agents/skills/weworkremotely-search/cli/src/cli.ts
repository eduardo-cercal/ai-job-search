#!/usr/bin/env bun
// Self-contained CLI for searching jobs on We Work Remotely (weworkremotely.com), a large
// global remote-jobs board. No external CLI framework, so it runs anywhere `bun` is
// available with zero install beyond the repo clone.
//
// Data source is the site's combined-categories RSS feed (remote-jobs.rss) — every
// ordinary HTML page (homepage, search, individual job pages) 403s behind a Cloudflare
// JS challenge for an honest, non-browser User-Agent, confirmed live. See helpers.ts for
// the full explanation. There is no query/keyword parameter on the feed (--query filters
// client-side by word against company/title/category/description) and no real
// pagination (`?page=2` is a confirmed no-op) — see SKILL.md Notes.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

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

const HELP = `weworkremotely-cli — search jobs on We Work Remotely (weworkremotely.com), a global remote-jobs board

USAGE
  bun run src/cli.ts search --query "<keyword>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      REQUIRED. Split into words and matched (AND, case-insensitive)
                          against each listing's company, title, category, and
                          description text (the feed has no server-side search
                          parameter — see NOTES). e.g. "flutter".
  --location, -l <text>   Client-side filter over the feed's own <region> field, e.g.
                          "Anywhere in the World" (the overwhelming majority of listings),
                          "USA Only", or a real city/country name. Optional.
  --jobage <days>         Only postings within N days, using each item's real pubDate.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

  No --page flag: the combined feed has no real pagination (\`?page=2\` is a confirmed
  no-op, verified live) — it always returns the same latest ~10 postings per category
  (~90 total). Passing --page is rejected (UNKNOWN_FLAG) rather than silently ignored.

EXAMPLES
  bun run src/cli.ts search -q "flutter" --format table
  bun run src/cli.ts search -q "react native" --jobage 14 --format table
  bun run src/cli.ts search -q "engineer" -l "USA Only" --format table
  bun run src/cli.ts detail edfinity-senior-software-engineer-remote --format plain

NOTES
  - Every ordinary HTML page on this site (search, job listings, job detail pages) 403s
    behind a Cloudflare JS challenge for this CLI's honest User-Agent. Only the .rss feed
    endpoints return real content — this CLI uses remote-jobs.rss as its sole data source.
  - detail re-fetches the same feed and looks up the job by its own link/guid slug (the
    feed already embeds the full description, so no second page fetch is needed) — it only
    finds jobs still in the feed's rolling window; an older posting returns NOT_FOUND.

Public feed, no authentication required. Keep request volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "limit", "format", "help", "h"]),
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
    const query = typeof flags.query === "string" ? flags.query : undefined
    if (!query) {
      process.stderr.write(
        JSON.stringify({
          error: 'the --query/-q flag is required (e.g. -q "flutter") - matched client-side against company/title/category/description',
          code: "NO_QUERY",
        }) + "\n",
      )
      return 1
    }
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
    let limit: number | undefined
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }

    const opts: SearchOpts = {
      query,
      location: typeof flags.location === "string" ? flags.location : undefined,
      jobage,
      limit,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
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
