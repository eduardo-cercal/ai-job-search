import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.js";

// Live smoke tests — hit the real InfoJobs site. Keep volume low (a handful of
// requests per run), per the personal-use note in SKILL.md.

interface SearchResult {
  meta: { count: number; page: number };
  results: Array<{ id: string; title: string; company: string | null; location: string | null; date: string | null; url: string }>;
}

describe("live search", () => {
  test("search for 'desenvolvedor flutter' returns real results", async () => {
    const result = await runCLI(["search", "-q", "desenvolvedor flutter", "--limit", "5"]);
    expect(result.exitCode).toBe(0);
    const data = parseJSON<SearchResult>(result);
    expect(data.results.length).toBeGreaterThan(0);
    for (const job of data.results) {
      expect(job.id).toMatch(/^\d+$/);
      expect(job.title.length).toBeGreaterThan(0);
      expect(job.url).toContain("infojobs.com.br");
    }
  }, 30000);

  test("page 2 returns different results than page 1 (fragment-endpoint pagination)", async () => {
    const p1 = parseJSON<SearchResult>(await runCLI(["search", "-q", "desenvolvedor", "--limit", "20"]));
    const p2 = parseJSON<SearchResult>(
      await runCLI(["search", "-q", "desenvolvedor", "--page", "2", "--limit", "20"]),
    );
    expect(p1.results.length).toBeGreaterThan(0);
    expect(p2.results.length).toBeGreaterThan(0);
    const p1Ids = new Set(p1.results.map((r) => r.id));
    const overlap = p2.results.filter((r) => p1Ids.has(r.id));
    expect(overlap.length).toBe(0);
  }, 30000);

  test("detail on a live result returns a readable description", async () => {
    const searchResult = await runCLI(["search", "-q", "desenvolvedor flutter", "--limit", "1"]);
    const data = parseJSON<SearchResult>(searchResult);
    expect(data.results.length).toBeGreaterThan(0);
    const id = data.results[0].id;

    const detailResult = await runCLI(["detail", id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toContain("<");
  }, 30000);
});
