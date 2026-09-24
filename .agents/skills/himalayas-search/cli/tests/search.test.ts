import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.js";

// Live smoke tests — hit the real Himalayas feed. Keep volume low (a handful of
// requests per run), per SKILL.md.

interface SearchResult {
  meta: { count: number; page: number };
  results: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    date: string | null;
    deadline: string | null;
    url: string;
    categories: string | null;
  }>;
}

describe("live search", () => {
  test("search for 'engineer' returns real, matching results", async () => {
    const result = await runCLI(["search", "-q", "engineer", "--limit", "5"]);
    expect(result.exitCode).toBe(0);
    const data = parseJSON<SearchResult>(result);
    // The feed is a fixed 20-item rolling window client-side-filtered by query - a
    // niche term can legitimately return 0 matches, so assert shape/URL validity on
    // whatever came back rather than a minimum count.
    for (const job of data.results) {
      expect(job.id.length).toBeGreaterThan(0);
      expect(job.id).toContain("/");
      expect(job.title.length).toBeGreaterThan(0);
      expect(job.url).toContain("himalayas.app");
    }
  }, 30000);

  test("detail on a live result returns a readable description", async () => {
    const searchResult = await runCLI(["search", "-q", "engineer", "--limit", "1"]);
    const data = parseJSON<SearchResult>(searchResult);
    expect(data.results.length).toBeGreaterThan(0);
    const id = data.results[0].id;

    const detailResult = await runCLI(["detail", id, "--format", "plain"]);
    expect(detailResult.exitCode).toBe(0);
    expect(detailResult.stdout.length).toBeGreaterThan(0);
    expect(detailResult.stdout).not.toContain("<h3>");
  }, 30000);

  test("detail on a nonexistent id returns NOT_FOUND", async () => {
    const result = await runCLI(["detail", "this-company-12345/this-job-does-not-exist-12345"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NOT_FOUND");
  }, 30000);
});
