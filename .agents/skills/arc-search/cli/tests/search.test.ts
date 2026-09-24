import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.js";

// Live smoke tests — hit the real Arc.dev site. Keep volume low (a handful of
// requests per run), per the personal-use note in SKILL.md.

interface SearchResult {
  meta: { count: number; page: number };
  results: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    date: string | null;
    url: string;
    source: "arc" | "external";
  }>;
}

describe("live search", () => {
  test("search for 'flutter' returns real results", async () => {
    const result = await runCLI(["search", "-q", "flutter", "--limit", "5"]);
    expect(result.exitCode).toBe(0);
    const data = parseJSON<SearchResult>(result);
    expect(data.results.length).toBeGreaterThan(0);
    for (const job of data.results) {
      expect(job.id.length).toBeGreaterThan(0);
      expect(job.title.length).toBeGreaterThan(0);
      expect(job.url).toContain("arc.dev/remote-jobs/j/");
      expect(["arc", "external"]).toContain(job.source);
    }
  }, 30000);

  test("an unrecognized category tag returns zero results, not the unfiltered firehose", async () => {
    const result = await runCLI(["search", "-q", "zzzznonexistentskillxyz123", "--limit", "5"]);
    expect(result.exitCode).toBe(0);
    const data = parseJSON<SearchResult>(result);
    expect(data.results).toHaveLength(0);
  }, 30000);

  test("detail on a live external result returns a readable description", async () => {
    const searchResult = await runCLI(["search", "-q", "flutter", "--limit", "10"]);
    const data = parseJSON<SearchResult>(searchResult);
    const externalJob = data.results.find((r) => r.source === "external");
    expect(externalJob).toBeDefined();

    const detailResult = await runCLI(["detail", externalJob!.id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toContain("<strong>");
  }, 30000);
});
