import { describe, expect, test } from "bun:test";
import { parseOpportunity, parseOpportunityDetail, typeFlag } from "../src/helpers";

describe("parseOpportunity", () => {
  const validJob = {
    id: 774366,
    name: "Desenvolvedor(a) Full Stack",
    company: { name: "trampos" },
    published_at: "2026-09-09T11:00:07.000-03:00",
    city: "Bragança Paulista",
    state: "SP",
    hybrid: false,
    category_name: "Tecnologia da Informação",
    type_name: "Emprego",
  };

  test("builds the canonical detail URL from the bare id", () => {
    const card = parseOpportunity(validJob);
    expect(card).not.toBeNull();
    expect(card!.id).toBe("774366");
    expect(card!.url).toBe("https://www.trampos.co/oportunidades/774366");
  });

  test("slices published_at down to a plain date", () => {
    const card = parseOpportunity(validJob);
    expect(card!.date).toBe("2026-09-09");
  });

  test("formats a plain on-site location as just city, state", () => {
    const card = parseOpportunity(validJob);
    expect(card!.location).toBe("Bragança Paulista, SP");
  });

  test("appends a Hybrid label when hybrid is true", () => {
    const card = parseOpportunity({ ...validJob, hybrid: true });
    expect(card!.location).toBe("Bragança Paulista, SP (Hybrid)");
  });

  test("labels a home_office job as Home Office even without a hybrid flag", () => {
    const card = parseOpportunity({ ...validJob, home_office: true, hybrid: false });
    expect(card!.location).toBe("Bragança Paulista, SP (Home Office)");
  });

  test("falls back to just the modality label when no city/state is set", () => {
    const card = parseOpportunity({ ...validJob, city: undefined, state: undefined, home_office: true });
    expect(card!.location).toBe("Home Office");
  });

  test("returns null for an entry missing required fields, without throwing", () => {
    expect(parseOpportunity({ id: 1 } as any)).toBeNull();
    expect(parseOpportunity(null as any)).toBeNull();
    expect(parseOpportunity(undefined as any)).toBeNull();
  });
});

describe("parseOpportunityDetail", () => {
  test("extracts description/prerequisite/desirable and drops placeholder salary/regime", () => {
    const payload = {
      opportunity: {
        id: 774366,
        name: "Desenvolvedor(a) Full Stack",
        company: { name: "trampos" },
        description: "Descrição completa",
        prerequisite: "Requisitos",
        desirable: "Diferenciais",
        perks: "Vale refeição",
        salary: "NÃO DIVULGADA",
        regime: "INDIFERENTE",
      },
    };
    const job = parseOpportunityDetail(payload, "774366");
    expect(job).not.toBeNull();
    expect(job!.description).toBe("Descrição completa");
    expect(job!.prerequisite).toBe("Requisitos");
    expect(job!.desirable).toBe("Diferenciais");
    expect(job!.perks).toBe("Vale refeição");
    // Both are the site's own "not set" placeholder values - real data, not noise.
    expect(job!.salary).toBeNull();
    expect(job!.regime).toBeNull();
  });

  test("keeps a real salary/regime value", () => {
    const payload = {
      opportunity: {
        id: 1,
        name: "Test",
        salary: "R$ 8.000,00",
        regime: "CLT",
      },
    };
    const job = parseOpportunityDetail(payload, "1");
    expect(job!.salary).toBe("R$ 8.000,00");
    expect(job!.regime).toBe("CLT");
  });

  test("returns null when no opportunity object is present", () => {
    expect(parseOpportunityDetail({}, "1")).toBeNull();
    expect(parseOpportunityDetail(null, "1")).toBeNull();
  });
});

describe("typeFlag", () => {
  test("accepts a single valid value", () => {
    expect(typeFlag("emprego")).toEqual(["emprego"]);
  });

  test("accepts comma-separated values", () => {
    expect(typeFlag("emprego,estagio")).toEqual(["emprego", "estagio"]);
  });

  test("rejects an unrecognized value", () => {
    expect(typeFlag("freelance")).toBeNull();
  });

  test("returns null when undefined", () => {
    expect(typeFlag(undefined)).toBeNull();
  });
});
