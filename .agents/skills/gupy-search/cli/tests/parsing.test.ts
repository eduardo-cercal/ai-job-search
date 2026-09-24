import { describe, expect, test } from "bun:test";
import {
  extractNextData,
  parseGupyJob,
  parseGupyDetail,
  subdomainFromUrl,
  cleanHtml,
  workplaceTypeFlag,
} from "../src/helpers";

function nextDataHtml(payload: unknown): string {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
}

describe("extractNextData", () => {
  test("parses a well-formed __NEXT_DATA__ script", () => {
    const html = nextDataHtml({ props: { pageProps: { foo: "bar" } } });
    const data = extractNextData(html);
    expect(data).not.toBeNull();
    expect(data.props.pageProps.foo).toBe("bar");
  });

  test("returns null when the script tag is absent", () => {
    expect(extractNextData("<html><body>no data</body></html>")).toBeNull();
  });

  test("returns null when the script content is not valid JSON", () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{not json</script></body></html>`;
    expect(extractNextData(html)).toBeNull();
  });
});

describe("subdomainFromUrl", () => {
  test("extracts the company subdomain from a job URL", () => {
    expect(subdomainFromUrl("https://grupoboticario.gupy.io/job/abc123?jobBoardSource=gupy_portal")).toBe(
      "grupoboticario",
    );
  });

  test("returns null for a non-gupy URL", () => {
    expect(subdomainFromUrl("https://example.com/job/abc123")).toBeNull();
  });
});

describe("cleanHtml", () => {
  test("strips tags and decodes entities while keeping block breaks as newlines", () => {
    const html = "<p>Requisitos</p><ul><li>Flutter&nbsp;&amp; Dart</li></ul>";
    expect(cleanHtml(html)).toBe("Requisitos\nFlutter & Dart");
  });

  test("returns null for empty/undefined input", () => {
    expect(cleanHtml(null)).toBeNull();
    expect(cleanHtml(undefined)).toBeNull();
    expect(cleanHtml("")).toBeNull();
  });
});

describe("parseGupyJob", () => {
  const validJob = {
    id: 12393296,
    name: "Pessoa Desenvolvedora Fullstack Flutter/Node Especialista I",
    careerPageName: "Grupo Boticário",
    publishedDate: "2026-09-09T14:47:12.235Z",
    applicationDeadline: "2026-10-16T00:00:00.000Z",
    workplaceType: "remote",
    city: "",
    state: "",
    jobUrl: "https://grupoboticario.gupy.io/job/eyJqb2JJZCI6MTIzOTMyOTYsInNvdXJjZSI6Imd1cHlfcG9ydGFsIn0=?jobBoardSource=gupy_portal",
  };

  test("builds a composite id from the job's own URL subdomain", () => {
    const card = parseGupyJob(validJob);
    expect(card).not.toBeNull();
    expect(card!.id).toBe("grupoboticario/12393296");
  });

  test("carries the verified company display name straight from careerPageName", () => {
    const card = parseGupyJob(validJob);
    expect(card!.company).toBe("Grupo Boticário");
  });

  test("slices publishedDate/applicationDeadline down to a plain date", () => {
    const card = parseGupyJob(validJob);
    expect(card!.date).toBe("2026-09-09");
    expect(card!.deadline).toBe("2026-10-16");
  });

  test("formats a hybrid job's location with city, state, and modality label", () => {
    const card = parseGupyJob({ ...validJob, workplaceType: "hybrid", city: "Curitiba", state: "Paraná" });
    expect(card!.location).toBe("Curitiba, Paraná (Hybrid)");
  });

  test("falls back to just the modality label when no city/state is set", () => {
    const card = parseGupyJob(validJob);
    expect(card!.location).toBe("Remote");
  });

  test("returns null for an entry missing required fields, without throwing", () => {
    expect(parseGupyJob({ id: 1 })).toBeNull();
    expect(parseGupyJob(null)).toBeNull();
    expect(parseGupyJob(undefined)).toBeNull();
  });
});

describe("parseGupyDetail", () => {
  function detailPayload(job: Record<string, unknown>) {
    return { props: { pageProps: { job } } };
  }

  test("extracts the verified company name from careerPage.name", () => {
    const nextData = detailPayload({
      id: 12393296,
      name: "Desenvolvedor Mobile",
      careerPage: { name: "Grupo Boticário" },
      workplaceType: "remote",
      publishedAt: "2026-09-09T14:47:12.235Z",
      expiresAt: "2026-11-23",
      description: "<p>Descrição</p>",
      prerequisites: "<ul><li>Flutter</li></ul>",
    });
    const job = parseGupyDetail(nextData, "grupoboticario/12393296", "https://grupoboticario.gupy.io/job/x");
    expect(job).not.toBeNull();
    expect(job!.company).toBe("Grupo Boticário");
    expect(job!.deadline).toBe("2026-11-23");
    expect(job!.description).toBe("Descrição");
    expect(job!.prerequisites).toBe("Flutter");
  });

  test("returns null when no job object is present", () => {
    expect(parseGupyDetail({ props: { pageProps: {} } }, "x/1", "https://example.com")).toBeNull();
    expect(parseGupyDetail(null, "x/1", "https://example.com")).toBeNull();
  });
});

describe("workplaceTypeFlag", () => {
  test("accepts remote and hybrid, singly and combined", () => {
    expect(workplaceTypeFlag("remote")).toBe("remote");
    expect(workplaceTypeFlag("hybrid")).toBe("hybrid");
    expect(workplaceTypeFlag("remote,hybrid")).toBe("remote,hybrid");
  });

  test("rejects an unconfirmed value (e.g. an on-site guess)", () => {
    expect(workplaceTypeFlag("onsite")).toBeNull();
    expect(workplaceTypeFlag("on_site")).toBeNull();
  });

  test("returns null when undefined", () => {
    expect(workplaceTypeFlag(undefined)).toBeNull();
  });
});
