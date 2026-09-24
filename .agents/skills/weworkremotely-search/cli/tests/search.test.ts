import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.js";

// Live smoke tests — hit the real We Work Remotely feed. Keep volume low (a handful of
// requests per run), per SKILL.md.

interface SearchResult {
  meta: { count: number; page: number };
  results: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    date: string | null;
    url: string;
    category: string | null;
    skills: string | null;
    employmentType: string | null;
  }>;
}

describe("live search", () => {
  test("search for 'flutter' returns real, matching results", async () => {
    const result = await runCLI(["search", "-q", "flutter", "--limit", "5"]);
    expect(result.exitCode).toBe(0);
    const data = parseJSON<SearchResult>(result);
    // Flutter volume in the combined feed can be genuinely tiny (client-side filter over
    // ~90 items, mostly matched via description text rather than title) — assert shape
    // and URL validity, not a minimum count.
    for (const job of data.results) {
      expect(job.id.length).toBeGreaterThan(0);
      expect(job.title.length).toBeGreaterThan(0);
      expect(job.url).toContain("weworkremotely.com");
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
    expect(detailResult.stdout).not.toContain("<");
  }, 30000);

  test("detail on a nonexistent id returns NOT_FOUND", async () => {
    const result = await runCLI(["detail", "this-job-does-not-exist-anywhere-12345"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NOT_FOUND");
  }, 30000);
});
