import { describe, expect, test } from "bun:test";
import { buildSearchUrl, parseJobCards, filterCardsByQuery, normalizeId } from "../src/helpers.js";

describe("buildSearchUrl", () => {
  test("builds a plain listing URL with no params", () => {
    expect(buildSearchUrl(undefined, 1)).toBe("https://programathor.com.br/jobs");
  });
  test("adds the place param for a location", () => {
    expect(buildSearchUrl("Curitiba", 1)).toBe("https://programathor.com.br/jobs?place=Curitiba");
  });
  test("adds a page param for page > 1", () => {
    expect(buildSearchUrl(undefined, 2)).toBe("https://programathor.com.br/jobs?page=2");
  });
});

// Fixture based on real ProgramaThor listing markup (captured 2026-09-04).
const CARD_FIXTURE = `
<div class="col-md-9">
  <div class="cell-list ">
    <a href="/jobs/33756-engenheiro-de-automacao-ia-senior">
      <div class="row">
        <div class="col-sm-3">
          <div class="cell-logo hidden-xs"><img src=https://programathor.com.br/x.png alt=RDC class='logo-list' loading='lazy'></div>
        </div>
        <div class="col-sm-9">
          <div class="cell-list-content"><h3 class="text-24 line-height-30">Engenheiro de Automação IA Sênior</h3><div class='cell-list-content-icon'><span><i class='fa fa-briefcase'></i>RDC VIAGENS</span><span><i class='fas fa-map-marker-alt'></i>São Caetano do Sul/SP  (Híbrido)</span><span><i class='fa fa-building'></i>Pequena/média empresa</span><span><i class='far fa-chart-bar'></i>Sênior</span><span><i class='far fa-file-alt'></i>PJ</span></div><div><span class='tag-list background-gray'>C#</span><span class='tag-list background-gray'>CI/CD</span><span class='tag-list background-gray'>kubernetes</span></div></div>
        </div>
      </div>
    </a>
  </div>
  <div class="cell-list ">
    <a href="/jobs/33724-desenvolvedor-a-mobile-flutter-senior">
      <div class="row">
        <div class="col-sm-3">
          <div class="cell-logo hidden-xs"><div class='logo-list'><img alt="Ubuntu Future Labs" src="https://x.png" /></div></div>
        </div>
        <div class="col-sm-9">
          <div class="cell-list-content"><h3 class="text-24 line-height-30">Desenvolvedor(a) Mobile Flutter - Sênior</h3><div class='cell-list-content-icon'><span><i class='fa fa-briefcase'></i>Ubuntu Future Labs</span><span><i class='fas fa-map-marker-alt'></i>Remoto</span><span><i class='fa fa-building'></i>Pequena/média empresa</span><span><i class='far fa-chart-bar'></i>Sênior</span><span><i class='far fa-file-alt'></i>PJ</span></div><div><span class='tag-list background-gray'>API</span><span class='tag-list background-gray'>Dart</span><span class='tag-list background-gray'>Firebase</span><span class='tag-list background-gray'>Flutter</span><span class='tag-list background-gray'>RESTful</span><span class='tag-list background-gray'>Kotlin</span><span class='tag-list background-gray'>Swift</span></div></div>
        </div>
      </div>
    </a>
  </div>
</div>
`;

describe("parseJobCards", () => {
  test("parses id, title, url, company, location, tags from real markup shape", () => {
    const cards = parseJobCards(CARD_FIXTURE);
    expect(cards).toHaveLength(2);

    expect(cards[0].id).toBe("33756");
    expect(cards[0].title).toBe("Engenheiro de Automação IA Sênior");
    expect(cards[0].url).toBe("https://programathor.com.br/jobs/33756-engenheiro-de-automacao-ia-senior");
    expect(cards[0].company).toBe("RDC VIAGENS");
    expect(cards[0].location).toBe("São Caetano do Sul/SP (Híbrido)");
    expect(cards[0].date).toBeNull();
    expect(cards[0].tags).toEqual(["C#", "CI/CD", "kubernetes"]);

    expect(cards[1].id).toBe("33724");
    expect(cards[1].title).toBe("Desenvolvedor(a) Mobile Flutter - Sênior");
    expect(cards[1].company).toBe("Ubuntu Future Labs");
    expect(cards[1].location).toBe("Remoto");
    expect(cards[1].tags).toContain("Flutter");
  });

  test("does not leak tags from one card's chunk into a differently-classed sidebar pill", () => {
    const withSidebar = `<div class="filter"><div class="company-tag tag-list background-gray tag-shadow relative-block">Pequena/média empresa</div></div>` + CARD_FIXTURE;
    const cards = parseJobCards(withSidebar);
    expect(cards[0].tags).toEqual(["C#", "CI/CD", "kubernetes"]);
  });

  test("skips a chunk with no parseable link instead of throwing", () => {
    const cards = parseJobCards(`<div class="cell-list ">no link here</div>`);
    expect(cards).toHaveLength(0);
  });

  test("returns an empty list for markup with no cell-list items", () => {
    expect(parseJobCards("<html><body>no jobs</body></html>")).toHaveLength(0);
  });
});

describe("filterCardsByQuery", () => {
  const cards = parseJobCards(CARD_FIXTURE);

  test("matches on title", () => {
    const filtered = filterCardsByQuery(cards, "mobile");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("33724");
  });

  test("matches on a tech-stack tag not present in the title", () => {
    const filtered = filterCardsByQuery(cards, "kubernetes");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("33756");
  });

  test("is case-insensitive", () => {
    expect(filterCardsByQuery(cards, "FLUTTER")).toHaveLength(1);
  });

  test("multi-word query matches by word, not as one contiguous substring", () => {
    // "Desenvolvedor(a) Mobile Flutter - Sênior" does not literally contain
    // "Desenvolvedor Flutter", but both words are present.
    const filtered = filterCardsByQuery(cards, "Desenvolvedor Flutter");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("33724");
  });

  test("multi-word query requires every word to match (AND, not OR)", () => {
    expect(filterCardsByQuery(cards, "flutter kubernetes")).toHaveLength(0);
  });

  test("returns an empty list when nothing matches", () => {
    expect(filterCardsByQuery(cards, "cobol")).toHaveLength(0);
  });
});

describe("normalizeId", () => {
  test("extracts the id from a full detail URL", () => {
    expect(normalizeId("https://programathor.com.br/jobs/33724-desenvolvedor-a-mobile-flutter-senior")).toBe(
      "33724",
    );
  });
  test("passes through a bare id", () => {
    expect(normalizeId("33724")).toBe("33724");
  });
  test("returns null when no id-shaped number is present", () => {
    expect(normalizeId("not-an-id")).toBeNull();
  });
});
