#!/usr/bin/env bun
// Self-contained CLI for searching Brazil communication/marketing/tech job listings
// on trampos.co's public JSON API. No external CLI framework, so it runs anywhere
// `bun` is available with zero install beyond the repo clone.
//
// robots.txt on trampos.co is fully open (only /admin/ disallowed). The real search
// is client-side (the site itself server-renders only a static featured-jobs
// fallback), so this CLI talks to the same /api/v2/opportunities JSON endpoint the
// site's own Ember.js app uses - discovered by reading that app's bundle, not
// guessed. See url-reference.md.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { typeFlag } from "./helpers.js"

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

const HELP = `trampos-cli — search Brazil communication/marketing/tech job listings on trampos.co

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>    Free text keyword search. Recommended.
  --location, -l <text> City name (e.g. "Curitiba").
  --category <slug>     Category slug(s), comma-separated. Known examples: ti
                         (Tecnologia da Informação), design, marketing, criacao,
                         midia, comercial, rh, administrativo, cs. An unrecognized
                         slug returns zero results rather than erroring - this is
                         the site's own behavior, not validated client-side (the
                         category list is larger and more dynamic than --type's).
  --type <slug>          emprego | estagio | banco-talentos. Comma-separated.
  --jobage <days>        Posted within N days - client-side filter (no native
                         param confirmed).
  --page <n>             1-indexed page (12 results/page). Confirmed working -
                         unlike some other portals in this repo.
  --limit, -n <n>        Cap results emitted (client-side).
  --format <fmt>         json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "desenvolvedor" --category ti --format table
  bun run src/cli.ts search -q "mobile" -l "São Paulo" --type emprego --format table
  bun run src/cli.ts detail 774366 --format plain

robots.txt permits this (only /admin/ is disallowed) - see SKILL.md.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "category", "type", "jobage", "page", "limit", "format", "help", "h"]),
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

    let limit: number | undefined
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      limit = v
    }

    let type: string[] | undefined
    if (typeof flags.type === "string") {
      const normalized = typeFlag(flags.type)
      if (normalized === null) {
        process.stderr.write(
          JSON.stringify({
            error: `--type must be one or more of emprego, estagio, banco-talentos (comma-separated), got "${flags.type}"`,
            code: "BAD_ARG",
          }) + "\n",
        )
        return 1
      }
      type = normalized
    }

    const category = typeof flags.category === "string" ? (flags.category as string).split(",").map((c) => c.trim().toLowerCase()) : undefined

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      category,
      type,
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
