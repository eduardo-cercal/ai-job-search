import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.js";

// Live smoke tests — hit the real ProgramaThor site. Keep volume low (a handful of
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
    tags: string[];
  }>;
}

describe("live search", () => {
  test("search for 'flutter' returns real, matching results", async () => {
    const result = await runCLI(["search", "-q", "flutter", "--limit", "5"]);
    expect(result.exitCode).toBe(0);
    const data = parseJSON<SearchResult>(result);
    // Flutter volume on this portal can be genuinely tiny (client-side filter over one
    // page of 15 cards) — assert the shape and matching discipline, not a minimum count.
    for (const job of data.results) {
      expect(job.id).toMatch(/^\d+$/);
      expect(job.title.length).toBeGreaterThan(0);
      expect(job.url).toContain("programathor.com.br");
      const needle = "flutter";
      const matches =
        job.title.toLowerCase().includes(needle) || job.tags.some((t) => t.toLowerCase().includes(needle));
      expect(matches).toBe(true);
    }
  }, 30000);

  test("detail always fails with DETAIL_UNSUPPORTED", async () => {
    const result = await runCLI(["detail", "1"]);
    expect(result.exitCode).toBe(1);
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("DETAIL_UNSUPPORTED");
  }, 30000);
});
