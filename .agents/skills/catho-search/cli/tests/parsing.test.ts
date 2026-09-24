import { describe, expect, test } from "bun:test";
import {
  slugify,
  buildSearchUrl,
  parseOfferCards,
  parseRelativeDate,
  parseTotalCount,
  normalizeId,
  parseJobDetail,
} from "../src/helpers.js";

describe("slugify", () => {
  test("lowercases, strips accents, hyphenates", () => {
    expect(slugify("Desenvolvedor Flutter")).toBe("desenvolvedor-flutter");
    expect(slugify("Análise de Sistemas")).toBe("analise-de-sistemas");
  });
});

describe("buildSearchUrl", () => {
  test("builds a plain query URL", () => {
    expect(buildSearchUrl("desenvolvedor flutter", undefined, 1)).toBe(
      "https://www.catho.com.br/vagas/desenvolvedor-flutter/",
    );
  });
  test("adds a location segment", () => {
    expect(buildSearchUrl("desenvolvedor flutter", "Curitiba", 1)).toBe(
      "https://www.catho.com.br/vagas/desenvolvedor-flutter/curitiba/",
    );
  });
  test("adds a pagina-N segment for page > 1", () => {
    expect(buildSearchUrl("desenvolvedor", undefined, 2)).toBe(
      "https://www.catho.com.br/vagas/desenvolvedor/pagina-2/",
    );
  });
});

// Fixture based on real Catho search-results markup (captured 2026-09-04).
const CARD_FIXTURE = `
<li data-offer-item="37584918" data-blind="false" class="mb-5" an-action data-event="job-card_interaction">
  <div data-near-alert class="hidden"></div>
  <article class="offer" data-offer-item-subcontainer>
    <span class="tag pub_ontem mb-2">Publicada em 20/07</span>
    <h2 class="title_offer">
      <a href="/vagas/desenvolvedor-de-aplicativos-moveis-flutter/37584918" title="Desenvolvedor de Aplicativos M&#xF3;veis - Flutter" data-navigation-offer>Desenvolvedor de Aplicativos M&#xF3;veis - Flutter</a>
    </h2>
    <p class="mb-2">
      <span class="text-12">RP INFO SISTEMAS</span>
    </p>
    <p>
      <span class="icon i_job_location"></span>
      <strong>2 vagas</strong>
      - Curitiba
    </p>
  </article>
</li>
<li data-offer-item="38100211" data-blind="false" class="mb-5">
  <article class="offer" data-offer-item-subcontainer>
    <span class="tag pub_hoje mb-2">Publicada Hoje</span>
    <h2 class="title_offer">
      <a href="/vagas/desenvolvedor-front-end-flutter-dart-senior/38100211" title="Desenvolvedor Front End Flutter Dart S&#xEA;nior" data-navigation-offer>Desenvolvedor Front End Flutter Dart S&#xEA;nior</a>
    </h2>
    <p class="mb-2">
      <span class="text-12 mr-2">Empresa Confidencial</span>
      <button class="text-linkColor btn-popup" data-popup-confidential-company>Por que?</button>
    </p>
    <p>
      <span class="icon i_job_location"></span>
      <strong>1 vaga</strong>
      - Remote
    </p>
  </article>
</li>
<li data-offer-item="38117233" data-blind="false" class="mb-5">
  <article class="offer" data-offer-item-subcontainer>
    <span class="tag pub_ontem mb-2">Publicada em 25/08</span>
    <h2 class="title_offer">
      <a href="/vagas/trabalhe-de-casa-desenvolvedor-flutter/38117233" title="Trabalhe de Casa Desenvolvedor Flutter" data-navigation-offer>Trabalhe de Casa Desenvolvedor Flutter</a>
    </h2>
    <p class="mb-2">
      <span class="text-12">BAIRESDEV</span>
    </p>
    <p>
      <span class="icon i_job_location"></span>
      <strong>36 vagas</strong>
      - Barueri
      <span class="text-linkColor font-bold" data-pop-more-offers> + 35 cidades</span>
    </p>
  </article>
</li>
`;

describe("parseOfferCards", () => {
  test("parses id, title, url, company, location, date from real markup shape", () => {
    const cards = parseOfferCards(CARD_FIXTURE);
    expect(cards).toHaveLength(3);

    expect(cards[0].id).toBe("37584918");
    expect(cards[0].title).toBe("Desenvolvedor de Aplicativos Móveis - Flutter");
    expect(cards[0].url).toBe(
      "https://www.catho.com.br/vagas/desenvolvedor-de-aplicativos-moveis-flutter/37584918",
    );
    expect(cards[0].company).toBe("RP INFO SISTEMAS");
    expect(cards[0].location).toBe("Curitiba");
    expect(cards[0].date).toBe("Publicada em 20/07");

    expect(cards[1].id).toBe("38100211");
    expect(cards[1].company).toBe("Empresa Confidencial");
    expect(cards[1].location).toBe("Remote");
    expect(cards[1].date).toBe("Publicada Hoje");

    // A "+N cidades" link between the city name and the closing </p> must not
    // suppress the location match (regression: previously required </p> right
    // after the city text and silently returned null here).
    expect(cards[2].id).toBe("38117233");
    expect(cards[2].location).toBe("Barueri");
  });

  test("skips a chunk with no parseable title instead of throwing", () => {
    const cards = parseOfferCards(`<li data-offer-item="123">no title here</li>`);
    expect(cards).toHaveLength(0);
  });

  test("returns an empty list for markup with no offer items", () => {
    expect(parseOfferCards("<html><body>no jobs</body></html>")).toHaveLength(0);
  });
});

describe("parseRelativeDate", () => {
  const now = new Date("2026-09-04T12:00:00Z");

  test("Hoje resolves to today", () => {
    expect(parseRelativeDate("Publicada Hoje", now)).toBe("2026-09-04");
  });
  test("Ontem resolves to yesterday", () => {
    expect(parseRelativeDate("Atualizada Ontem", now)).toBe("2026-09-03");
  });
  test("DD/MM resolves to this year when not yet in the future", () => {
    expect(parseRelativeDate("Publicada em 20/07", now)).toBe("2026-07-20");
  });
  test("DD/MM rolls back a year when the date has not occurred yet this year", () => {
    expect(parseRelativeDate("Publicada em 25/12", now)).toBe("2025-12-25");
  });
  test("returns null for unrecognized text", () => {
    expect(parseRelativeDate("???", now)).toBeNull();
    expect(parseRelativeDate(null, now)).toBeNull();
  });
});

describe("parseTotalCount", () => {
  test("parses Brazilian dot-thousands notation from the meta description", () => {
    const html = `<meta name="description" content="Vagas de emprego para Desenvolvedor. 8.868 vagas disponíveis em todo o Brasil." />`;
    expect(parseTotalCount(html)).toBe(8868);
  });
  test("returns null when the phrase is absent", () => {
    expect(parseTotalCount("<html></html>")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("extracts the trailing numeric id from a full URL", () => {
    expect(normalizeId("https://www.catho.com.br/vagas/algum-cargo/37584918")).toBe("37584918");
  });
  test("passes through a bare id", () => {
    expect(normalizeId("37584918")).toBe("37584918");
  });
  test("returns null when no id-shaped number is present", () => {
    expect(normalizeId("not-an-id")).toBeNull();
  });
});

describe("parseJobDetail", () => {
  test("parses the JobPosting JSON-LD block", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": "Desenvolvedor de Aplicativos M\\u00f3veis - Flutter",
        "description": "Sobre a oportunidade\\nDetalhes da vaga...",
        "datePosted": "2026-07-20T23:59:59Z",
        "employmentType": "CLT (Efetivo)",
        "hiringOrganization": {"@type": "Organization", "name": "RP INFO SISTEMAS"},
        "jobLocation": [{"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": "Curitiba", "addressRegion": "PR", "addressCountry": "Brasil"}}]
      }
      </script>
    `;
    const job = parseJobDetail(html, "37584918");
    expect(job).not.toBeNull();
    expect(job?.title).toBe("Desenvolvedor de Aplicativos Móveis - Flutter");
    expect(job?.company).toBe("RP INFO SISTEMAS");
    expect(job?.location).toBe("Curitiba, PR");
    expect(job?.date).toBe("2026-07-20");
    expect(job?.employmentType).toBe("CLT (Efetivo)");
    expect(job?.description).toContain("Sobre a oportunidade");
  });

  test("returns null when no JobPosting JSON-LD block is present", () => {
    expect(parseJobDetail("<html><body>no data here</body></html>", "1")).toBeNull();
  });
});
