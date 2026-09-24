# himalayas-cli

CLI for searching jobs on **Himalayas** (himalayas.app), an international remote-tech job board.

**Data source**: the site's RSS feed (`/jobs/rss`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Why RSS, not HTML?** Every ordinary page on this site — the `/jobs` search page,
> individual job pages — returned an HTTP 403 Cloudflare managed challenge ("Just a
> moment...") for this CLI's honest, non-browser User-Agent, confirmed live, and
> confirmed to persist even with a full browser User-Agent string. The feed URL itself
> was discovered from the plain, unblocked `/rss` info page, which links to
> `himalayas.app/jobs/rss` — that endpoint returned real content with the same honest
> UA every other page rejected. This CLI does not attempt to spoof its way past the
> challenge (that escalation path belongs to a higher-level agent decision, not a
> portal CLI's default) — it simply uses the feed, a legitimate, publicly-linked data
> source in its own right.
>
> This has two consequences: there is no server-side keyword search (the feed has
> none — `--query` filters client-side), and there is no separate `detail` page fetch
> (`detail` re-reads the same feed, which already embeds each job's full description).

## Installation

```bash
cd .agents/skills/himalayas-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required, filtered client-side) |
| `detail` | Look up one job by id from the same feed (no second page fetch) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Flutter-mentioning roles (client-side filtered from the feed's latest 20 postings)
bun run src/cli.ts search -q "flutter" --format table

# Roles posted in the last 7 days
bun run src/cli.ts search -q "mobile engineer" --jobage 7 --format table

# US-restricted roles only
bun run src/cli.ts search -q "engineer" -l "United States" --format table

# Full detail for one job (must still be in the feed's rolling window)
bun run src/cli.ts detail featherless-ai/founding-sales-engineer --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the feed
structure, the live evidence behind the Cloudflare-block/RSS-works split, and the
no-pagination finding.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Matched client-side (AND, by word) against company + title + categories + description. |
| `--location` | `-l` | Optional. Client-side substring filter over the feed's country-restriction list — most postings carry none (worldwide-eligible) and are excluded by any `--location` filter, not vacuously matched. |
| `--jobage` | | Only postings within N days, using each item's real `pubDate`. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

No `--page` flag: the feed has no real pagination (`?searchQuery=`, `?category=`, and
`?limit=` all confirmed live as no-ops — the feed always returns the same latest 20
items site-wide). Passing it is rejected (`UNKNOWN_FLAG`) rather than silently accepted
and ignored.
