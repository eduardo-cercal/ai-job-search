#!/usr/bin/env bun
// Self-contained CLI for searching jobs on ProgramaThor (programathor.com.br), a
// developer-focused Brazilian job board. No external CLI framework, so it runs anywhere
// `bun` is available with zero install beyond the repo clone.
//
// Public pages, no authentication. robots.txt's generic `User-Agent: *` block only
// disallows /admin/, /user/, /users/, /company/ — none of which this CLI touches (search
// uses /jobs). Keep volume low regardless.
//
// SEARCH ONLY — there is no `detail` command. See src/commands/detail.ts for why: every
// job detail page returns a site-side HTTP 500, confirmed live, independent of this CLI.
// There is also no server-side search parameter; --query is a client-side filter over
// each card's title and tech-stack tags — see src/helpers.ts for the live evidence.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail } from "./commands/detail.js"

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

const HELP = `programathor-cli — search jobs on ProgramaThor (programathor.com.br), a developer-focused Brazilian job board

USAGE
  bun run src/cli.ts search --query "<title>" [flags]
  bun run src/cli.ts detail <id>   (always fails — see NOTES)

SEARCH FLAGS
  --query, -q <text>      REQUIRED. Matched client-side against each job's title and
                          tech-stack tags (ProgramaThor has no server-side search
                          parameter — see NOTES). e.g. "flutter".
  --location, -l <text>   City name (e.g. "Curitiba") or the literal "Remoto" — maps to
                          ProgramaThor's own \`place\` filter, confirmed live to narrow
                          results genuinely. Optional.
  --page <n>              1-indexed page. Default 1. --query filters only within this one
                          fetched page (15 cards) — it does not fetch further pages to
                          backfill a small result set; pass a higher --page yourself for
                          more coverage.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "flutter" --format table
  bun run src/cli.ts search -q "flutter" -l "Curitiba" --format table
  bun run src/cli.ts search -q "react" -l "Remoto" --page 2 --format table

NOTES
  - No detail command: every /jobs/<id>-<slug> page returns a site-side HTTP 500 right
    now (confirmed live, not a bug in this CLI). Use search output directly.
  - No --jobage flag: ProgramaThor's listing cards carry no posting-date field at all, so
    there is nothing to filter by age; the flag is rejected (UNKNOWN_FLAG) rather than
    silently accepted and ignored.

Public pages, no authentication required. Keep request volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "page", "limit", "format", "help", "h"]),
  detail: new Set(["help", "h"]),
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
          error: 'the --query/-q flag is required (e.g. -q "flutter") - matched client-side against title and tags',
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

    const opts: SearchOpts = {
      query,
      location: typeof flags.location === "string" ? flags.location : undefined,
      page,
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
    return runDetail({ id })
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
