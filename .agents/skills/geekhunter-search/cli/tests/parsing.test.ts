import { describe, expect, test } from "bun:test";
import {
  extractSearchBlob,
  humanizeSlug,
  parsePublicJob,
  parseJobDetail,
  workModalityFlag,
  experienceLevelFlag,
} from "../src/helpers";

// Fixture mirrors the real page: the search-results HTML embeds
// `{"data":[...],"meta":{...}}` as a JSON-escaped string inside a Next.js RSC
// chunk. We escape the payload's own JSON text (backslashes first, then
// quotes) and splice it into an HTML shell, so the test exercises the same
// double-unescape path as production (see extractSearchBlob), not a shortcut.
function buildSearchHtml(payload: unknown): string {
  const payloadJson = JSON.stringify(payload);
  const escapedForEmbedding = payloadJson.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `<html><body><script>self.__next_f.push([1,"...before...${escapedForEmbedding}...after..."])</script></body></html>`;
}

describe("extractSearchBlob", () => {
  test("round-trips a payload through the double-escaped RSC embedding", () => {
    const payload = {
      data: [{ __typename: "PublicJob", id: "ats_1" }],
      meta: { total: 1, currentPage: 1, lastPage: 1, perPage: 25 },
    };
    const html = buildSearchHtml(payload);
    const blob = extractSearchBlob(html);
    expect(blob).not.toBeNull();
    expect(blob!.data).toHaveLength(1);
    expect(blob!.meta.total).toBe(1);
  });

  test("returns an empty data array for a zero-result search", () => {
    const payload = { data: [], meta: { total: 0, currentPage: 1, lastPage: 0, perPage: 25 } };
    const html = buildSearchHtml(payload);
    const blob = extractSearchBlob(html);
    expect(blob).not.toBeNull();
    expect(blob!.data).toHaveLength(0);
  });

  test("returns null when the anchor is entirely absent", () => {
    expect(extractSearchBlob("<html><body>no data here</body></html>")).toBeNull();
  });
});

describe("humanizeSlug", () => {
  test("strips a trailing numeric disambiguator and title-cases words", () => {
    expect(humanizeSlug("nava-technology-for-business-1")).toBe("Nava Technology For Business");
  });

  test("leaves a slug with no trailing number untouched aside from casing", () => {
    expect(humanizeSlug("artium-solucoes")).toBe("Artium Solucoes");
  });
});

describe("parsePublicJob", () => {
  const validJob = {
    __typename: "PublicJob",
    id: "ats_18438",
    type: "ats",
    atsJob: {
      __typename: "AtsJob",
      id: 18438,
      jobSlug: "desenvolvedor-flutter-senior-4",
      publishedAt: "1788965885359",
      company: { __typename: "NestCompany", id: 14800, slug: "nava-technology-for-business-1" },
      atsJobDetail: {
        title: "Desenvolvedor Mobile - Sênior",
        experienceLevel: "senior",
        workModality: "remote",
        atsJobSalaries: [{ contractType: "PJ", minSalary: 9000, maxSalary: 11000, currency: "BRL", currencyRef: { symbol: "R$" } }],
        atsJobCities: [],
      },
    },
  };

  test("builds a composite id and URL from company slug + job slug", () => {
    const card = parsePublicJob(validJob);
    expect(card).not.toBeNull();
    expect(card!.id).toBe("nava-technology-for-business-1/desenvolvedor-flutter-senior-4");
    expect(card!.url).toBe(
      "https://www.geekhunter.com/pt/nava-technology-for-business-1/jobs/desenvolvedor-flutter-senior-4",
    );
  });

  test("converts the publishedAt epoch-ms string to an ISO date", () => {
    const card = parsePublicJob(validJob);
    expect(card!.date).toBe(new Date(1788965885359).toISOString().slice(0, 10));
  });

  test("formats a min-max salary range with its currency symbol", () => {
    const card = parsePublicJob(validJob);
    expect(card!.salary).toBe("R$ 9000-11000/mo");
  });

  test("combines city name and modality label when a city is present", () => {
    const hybridJob = {
      ...validJob,
      atsJob: {
        ...validJob.atsJob,
        atsJobDetail: {
          ...validJob.atsJob.atsJobDetail,
          workModality: "hybrid",
          atsJobCities: [{ name: "São Paulo, SP" }],
        },
      },
    };
    const card = parsePublicJob(hybridJob);
    expect(card!.location).toBe("São Paulo, SP (Hybrid)");
  });

  test("returns null for an entry missing required fields, without throwing", () => {
    expect(parsePublicJob({ __typename: "PublicJob" })).toBeNull();
    expect(parsePublicJob(null)).toBeNull();
    expect(parsePublicJob(undefined)).toBeNull();
  });
});

describe("parseJobDetail", () => {
  function ldJsonPage(posting: Record<string, unknown>): string {
    return `<html><head>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"GeekHunter"}</script>
      <script type="application/ld+json">${JSON.stringify(posting)}</script>
    </head></html>`;
  }

  test("extracts the JobPosting block among several JSON-LD scripts", () => {
    const html = ldJsonPage({
      "@type": "JobPosting",
      title: "Desenvolvedor Mobile - Sênior",
      datePosted: "2026-09-09",
      validThrough: "2026-12-08T14:57:18.255Z",
      jobLocationType: "TELECOMMUTE",
      description: "<p><strong>Requisitos</strong></p><ul><li>Flutter</li></ul>",
      hiringOrganization: { name: "Nava Technology for Business" },
      employmentType: ["FULL_TIME"],
    });
    const job = parseJobDetail(html, "nava/detail", "https://www.geekhunter.com/pt/nava/jobs/detail");
    expect(job).not.toBeNull();
    expect(job!.company).toBe("Nava Technology for Business");
    expect(job!.location).toBe("Remote");
    expect(job!.deadline).toBe("2026-12-08");
    expect(job!.description).toContain("Requisitos");
    expect(job!.description).toContain("Flutter");
    expect(job!.employmentType).toBe("FULL_TIME");
  });

  test("builds a city-based location from jobLocation for an on-site posting", () => {
    const html = ldJsonPage({
      "@type": "JobPosting",
      title: "Analista de Marketing",
      hiringOrganization: { name: "Bebee" },
      jobLocation: [{ address: { addressLocality: "São Paulo, SP", addressRegion: "SP" } }],
    });
    const job = parseJobDetail(html, "bebee/detail", "https://www.geekhunter.com/pt/bebee/jobs/detail");
    expect(job!.location).toBe("São Paulo, SP");
  });

  test("returns null when no JobPosting block is present", () => {
    const html = `<html><head><script type="application/ld+json">{"@type":"Organization"}</script></head></html>`;
    expect(parseJobDetail(html, "x/y", "https://example.com")).toBeNull();
  });
});

describe("workModalityFlag", () => {
  test("accepts a single valid value", () => {
    expect(workModalityFlag("remote")).toBe("remote");
  });

  test("aliases onsite to on-site", () => {
    expect(workModalityFlag("onsite")).toBe("on-site");
  });

  test("accepts comma-separated values", () => {
    expect(workModalityFlag("hybrid,onsite")).toBe("hybrid,on-site");
  });

  test("rejects an unrecognized value", () => {
    expect(workModalityFlag("flying-car")).toBeNull();
  });

  test("returns null when undefined", () => {
    expect(workModalityFlag(undefined)).toBeNull();
  });
});

describe("experienceLevelFlag", () => {
  test("accepts a single valid value", () => {
    expect(experienceLevelFlag("senior")).toBe("senior");
  });

  test("accepts comma-separated values", () => {
    expect(experienceLevelFlag("mid,senior")).toBe("mid,senior");
  });

  test("rejects an unrecognized value", () => {
    expect(experienceLevelFlag("wizard")).toBeNull();
  });
});
