import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.js";

// Live smoke tests — hit the real Catho site. Keep volume low (a handful of
// requests per run), per the personal-use note in SKILL.md.

interface SearchResult {
  meta: { count: number; page: number; total: number | null };
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
      expect(job.url).toContain("catho.com.br");
    }
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
