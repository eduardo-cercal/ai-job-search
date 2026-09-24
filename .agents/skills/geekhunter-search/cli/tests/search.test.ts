import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function buildSearchHtml(payload: unknown): string {
  // Escape the payload's own JSON text (backslashes first, then quotes) and
  // splice it into an HTML shell shaped like the real Next.js RSC chunk, so
  // runSearch exercises the same double-unescape extraction path as
  // production (see extractSearchBlob's own round-trip test for the detail).
  const payloadJson = JSON.stringify(payload);
  const escapedForEmbedding = payloadJson.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `<html><body><script>self.__next_f.push([1,"...before...${escapedForEmbedding}...after..."])</script></body></html>`;
}

function samplePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: [
      {
        __typename: "PublicJob",
        id: "ats_1",
        atsJob: {
          jobSlug: "desenvolvedor-flutter-senior",
          publishedAt: String(Date.now()),
          company: { slug: "acme-corp" },
          atsJobDetail: {
            title: "Desenvolvedor Flutter Sênior",
            experienceLevel: "senior",
            workModality: "remote",
            atsJobSalaries: [],
            atsJobCities: [],
          },
        },
      },
    ],
    meta: { total: 1, currentPage: 1, lastPage: 1, perPage: 25 },
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("runSearch", () => {
  test("--limit 0 emits zero results", async () => {
    globalThis.fetch = (async () => new Response(buildSearchHtml(samplePayload()))) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ page: 1, limit: 0, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(0);
  });

  test("builds the request URL with searchTerm, workModality, and cityName", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return new Response(buildSearchHtml(samplePayload({ data: [] })));
    }) as typeof fetch;

    const code = await runSearch({
      query: "flutter",
      location: "São Paulo, SP",
      workModality: "remote",
      page: 1,
      format: "json",
    });

    expect(code).toBe(0);
    expect(capturedUrl).toContain("searchTerm=flutter");
    expect(capturedUrl).toContain("workModality=remote");
    expect(capturedUrl).toContain("cityName=");
    expect(decodeURIComponent(new URL(capturedUrl).searchParams.get("cityName") ?? "")).toBe("São Paulo, SP");
  });

  test("--jobage filters out a result older than the cutoff", async () => {
    const staleDate = new Date(Date.now() - 30 * 86400000).toISOString();
    const payload = samplePayload();
    (payload.data[0].atsJob as any).publishedAt = String(new Date(staleDate).getTime());
    globalThis.fetch = (async () => new Response(buildSearchHtml(payload))) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ jobage: 7, page: 1, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(0);
  });

  test("a fresh result survives the --jobage filter", async () => {
    globalThis.fetch = (async () => new Response(buildSearchHtml(samplePayload()))) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ jobage: 7, page: 1, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(1);
  });

  test("a malformed HTML response with no data blob yields zero results, not a crash", async () => {
    globalThis.fetch = (async () => new Response("<html>unexpected markup</html>")) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ page: 1, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(0);
  });
});
