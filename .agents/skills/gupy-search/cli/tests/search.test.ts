import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function nextDataHtml(payload: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
}

function samplePayload(jobs: Record<string, unknown>[] = [sampleJob()]) {
  return {
    props: {
      pageProps: {
        initialJobList: { data: jobs, pagination: { total: jobs.length, limit: 12, offset: 0 } },
      },
    },
  };
}

function sampleJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Desenvolvedor Flutter Sênior",
    careerPageName: "Acme",
    publishedDate: new Date().toISOString(),
    applicationDeadline: null,
    workplaceType: "remote",
    city: "",
    state: "",
    jobUrl: "https://acme.gupy.io/job/token1",
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("runSearch", () => {
  test("--limit 0 emits zero results", async () => {
    globalThis.fetch = (async () => new Response(nextDataHtml(samplePayload()))) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ page: 1, limit: 0, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(0);
  });

  test("builds the request URL with term, city[], state, and workplaceType", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return new Response(nextDataHtml(samplePayload([])));
    }) as typeof fetch;

    const code = await runSearch({
      query: "flutter",
      location: "Curitiba",
      state: "Paraná",
      workplaceType: "remote",
      page: 1,
      format: "json",
    });

    expect(code).toBe(0);
    expect(capturedUrl).toContain("term=flutter");
    expect(capturedUrl).toContain("city%5B%5D=Curitiba");
    expect(capturedUrl).toContain("workplaceType=remote");
    expect(capturedUrl).toContain(encodeURIComponent("Paraná"));
  });

  test("--jobage filters out a result older than the cutoff", async () => {
    const staleJob = sampleJob({ publishedDate: new Date(Date.now() - 30 * 86400000).toISOString() });
    globalThis.fetch = (async () => new Response(nextDataHtml(samplePayload([staleJob])))) as typeof fetch;

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
    globalThis.fetch = (async () => new Response(nextDataHtml(samplePayload()))) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ jobage: 7, page: 1, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(1);
  });

  test("a malformed response with no __NEXT_DATA__ yields zero results, not a crash", async () => {
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
