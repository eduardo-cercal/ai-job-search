# weworkremotely-cli

CLI for searching jobs on **We Work Remotely** (weworkremotely.com), a large global remote-jobs board.

**Data source**: the site's combined-categories RSS feed (`/remote-jobs.rss`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Why RSS, not HTML?** Every ordinary page on this site — the homepage, the
> `/remote-jobs/search` page, individual job pages — returned an HTTP 403 Cloudflare JS
> challenge ("Just a moment...") for this CLI's honest, non-browser User-Agent, confirmed
> live. Only the `.rss` feed endpoints returned real content with the exact same UA. This
> CLI does not work around the block by spoofing browser headers (that escalation path
> belongs to a higher-level agent decision, not a portal CLI's default) — it simply uses
> the feed, which is a legitimate, publicly-documented data source in its own right.
>
> This has two consequences: there is no server-side keyword search (the feed has none —
> `--query` filters client-side), and there is no separate `detail` page fetch (`detail`
> re-reads the same feed, which already embeds each job's full description).

## Installation

```bash
cd .agents/skills/weworkremotely-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required, filtered client-side) |
| `detail` | Look up one job by id/slug from the same feed (no second page fetch) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Flutter-mentioning roles (client-side filtered from the combined feed)
bun run src/cli.ts search -q "flutter" --format table

# Roles posted in the last 14 days
bun run src/cli.ts search -q "react native" --jobage 14 --format table

# US-only roles
bun run src/cli.ts search -q "engineer" -l "USA Only" --format table

# Full detail for one job (must still be in the feed's rolling window)
bun run src/cli.ts detail edfinity-senior-software-engineer-remote --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the feed
structure, the live evidence behind the Cloudflare-block/RSS-works split, and the
no-pagination finding.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Matched client-side (AND, by word) against company + title + category + description. |
| `--location` | `-l` | Optional. Client-side substring filter over the feed's `<region>` field. |
| `--jobage` | | Only postings within N days, using each item's real `pubDate`. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |

No `--page` flag: the feed has no real pagination (`?page=2` confirmed live as a no-op).
Passing it is rejected (`UNKNOWN_FLAG`) rather than silently accepted and ignored.
