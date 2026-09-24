import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function sampleJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Desenvolvedor Flutter Sênior",
    company: { name: "Acme" },
    published_at: new Date().toISOString(),
    city: "Curitiba",
    state: "PR",
    hybrid: false,
    category_name: "Tecnologia da Informação",
    type_name: "Emprego",
    ...overrides,
  };
}

function apiResponse(opportunities: Record<string, unknown>[] = [sampleJob()]) {
  return { opportunities, pagination: { total: opportunities.length, total_pages: 1, per_page: 12 } };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("runSearch", () => {
  test("--limit 0 emits zero results", async () => {
    globalThis.fetch = (async () => Response.json(apiResponse())) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ page: 1, limit: 0, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(0);
  });

  test("builds the request URL with tr, lc, ct[], and tp[]", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return Response.json(apiResponse([]));
    }) as typeof fetch;

    const code = await runSearch({
      query: "flutter",
      location: "Curitiba",
      category: ["ti"],
      type: ["emprego"],
      page: 1,
      format: "json",
    });

    expect(code).toBe(0);
    expect(capturedUrl).toContain("tr=flutter");
    expect(capturedUrl).toContain("lc=Curitiba");
    expect(capturedUrl).toContain("ct%5B%5D=ti");
    expect(capturedUrl).toContain("tp%5B%5D=emprego");
  });

  test("--jobage filters out a result older than the cutoff", async () => {
    const staleJob = sampleJob({ published_at: new Date(Date.now() - 30 * 86400000).toISOString() });
    globalThis.fetch = (async () => Response.json(apiResponse([staleJob]))) as typeof fetch;

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
    globalThis.fetch = (async () => Response.json(apiResponse())) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({ jobage: 7, page: 1, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(1);
  });

  test("a malformed response with no opportunities array yields zero results, not a crash", async () => {
    globalThis.fetch = (async () => Response.json({})) as typeof fetch;

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
