import { describe, expect, test } from "bun:test";
import {
  buildSearchUrl,
  fragmentUrl,
  parseOfferCards,
  normalizeId,
  parseJobDetail,
} from "../src/helpers.js";

describe("buildSearchUrl", () => {
  test("builds a plain query URL", () => {
    expect(buildSearchUrl("desenvolvedor flutter", undefined, 1)).toBe(
      "https://www.infojobs.com.br/empregos.aspx?palabra=desenvolvedor+flutter",
    );
  });
  test("folds location into the keyword text (no separate location param)", () => {
    expect(buildSearchUrl("desenvolvedor flutter", "Curitiba", 1)).toBe(
      "https://www.infojobs.com.br/empregos.aspx?palabra=desenvolvedor+flutter+Curitiba",
    );
  });
  test("adds a page param for page > 1", () => {
    expect(buildSearchUrl("desenvolvedor", undefined, 2)).toBe(
      "https://www.infojobs.com.br/empregos.aspx?palabra=desenvolvedor&page=2",
    );
  });
});

describe("fragmentUrl", () => {
  test("wraps the search URL for the infinite-scroll fragment endpoint", () => {
    const search = "https://www.infojobs.com.br/empregos.aspx?palabra=desenvolvedor&page=2";
    expect(fragmentUrl(search)).toBe(
      `https://www.infojobs.com.br/mf-publicarea/VacancyList/GetVacancyListFragment?url=${encodeURIComponent(search)}`,
    );
  });
});

// Fixture based on real InfoJobs search-results markup (captured 2026-09-04).
const CARD_FIXTURE = `
<div data-typesimilar="" class="card card-shadow card-shadow-hover text-break mb-16 pb-24 grid-row js_rowCard ">
  <div id="vacancy11076372" data-modelversion="" data-id="11076372" class="pt-24 px-24 cursor-pointer js_vacancyLoad js_rowCard js_cardLink" data-href="/vaga-de-desenvolvedor-sr-java-em-minas-gerais__11076372.aspx" data-testabbutton="false">
    <div class="d-flex flex-wrap gap-8">
      <div hidden class="js_date" data-value="2026/07/07 11:26:00"></div>
    </div>
    <div class="d-flex gap-8 justify-content-between">
      <a class="text-decoration-none" href="/vaga-de-desenvolvedor-sr-java-em-minas-gerais__11076372.aspx">
        <h2 class="h3 font-weight-bold text-body mb-2 js_vacancyTitle">
          DESENVOLVEDOR SR - JAVA
        </h2>
      </a>
      <div class="text-medium small text-nowrap">7 jul</div>
    </div>
    <div class="d-flex align-items-baseline">
      <div class="text-body">
        <a class="text-body text-decoration-none" href="https://www.infojobs.com.br/drogaria-araujo">
DROGARIA
<span class="text-nowrap">
    ARAUJO
    <span data-bs-toggle="tooltip"><svg class="icon icon-verified"><use xlink:href="#verified" /></svg></span>
</span>
        </a>
      </div>
    </div>
    <div class="mb-8">
      Belo Horizonte - MG<span hidden class="js_divUserVagaDistance">, 0 Km de você.</span>
    </div>
  </div>
</div>
<div data-typesimilar="" class="card card-shadow card-shadow-hover text-break mb-16 pb-24 grid-row js_rowCard ">
  <div id="vacancy11742895" data-modelversion="" data-id="11742895" class="pt-24 px-24 cursor-pointer js_vacancyLoad js_rowCard js_cardLink" data-href="/vaga-de-desenvolvedora-backend-junior-django-flutter-em-sao-paulo__11742895.aspx" data-testabbutton="false">
    <div class="d-flex flex-wrap gap-8">
      <div hidden class="js_date" data-value="2026/06/29 08:54:00"></div>
    </div>
    <div class="d-flex gap-8 justify-content-between">
      <a class="text-decoration-none" href="/vaga-de-desenvolvedora-backend-junior-django-flutter-em-sao-paulo__11742895.aspx">
        <h2 class="h3 font-weight-bold text-body mb-2 js_vacancyTitle">
          Desenvolvedora Backend J&#xFA;nior (Django/Flutter)
        </h2>
      </a>
    </div>
    <div class="text-body">
Empresa
<span class="text-nowrap">
    confidencial
    <span onclick="event.stopPropagation(); event.preventDefault();" class="cursor-pointer" data-bs-toggle="tooltip" data-bs-placement=right data-html="true" data-bs-title="<div class='text-left'>Este selo indica que a empresa foi verificada pelo Infojobs. <a class='text-white font-weight-bold text-decoration-underline' target='_blank' href='https://blog.infojobs.com.br/candidatos/infojobs-promove-selo-de-verificacao-para-empresas/'>Saiba o que isso significa</a>.</div>" title="<div class='text-left'>Este selo indica que a empresa foi verificada pelo Infojobs.</div>">
        <svg class="icon icon-verified"><use xlink:href="#verified" /></svg>
    </span>
</span>
    </div>
    <div class="mb-8">
      São Paulo - SP
    </div>
  </div>
</div>
`;

describe("parseOfferCards", () => {
  test("parses id, title, url, company, location, date from real markup shape", () => {
    const cards = parseOfferCards(CARD_FIXTURE);
    expect(cards).toHaveLength(2);

    expect(cards[0].id).toBe("11076372");
    expect(cards[0].title).toBe("DESENVOLVEDOR SR - JAVA");
    expect(cards[0].url).toBe(
      "https://www.infojobs.com.br/vaga-de-desenvolvedor-sr-java-em-minas-gerais__11076372.aspx",
    );
    expect(cards[0].company).toBe("DROGARIA ARAUJO");
    expect(cards[0].location).toBe("Belo Horizonte - MG");
    expect(cards[0].date).toBe("2026-07-07");

    // Second card exercises two real quirks together: a confidential listing with
    // no <a> (just bare "Empresa" + nested span text, no link), and a verified-badge
    // tooltip whose data-bs-title/title attribute VALUES contain literal, escaped
    // "<div>...</div>" markup describing the badge — which must not be mistaken for
    // the real closing </div> of the company block (regression: previously truncated
    // the match early and/or leaked the tooltip's own text into the company field).
    expect(cards[1].id).toBe("11742895");
    expect(cards[1].title).toBe("Desenvolvedora Backend Júnior (Django/Flutter)");
    expect(cards[1].company).toBe("Empresa confidencial");
    expect(cards[1].location).toBe("São Paulo - SP");
    expect(cards[1].date).toBe("2026-06-29");
  });

  test("returns an empty list for markup with no offer cards", () => {
    expect(parseOfferCards("<html><body>no jobs</body></html>")).toHaveLength(0);
  });

  test("skips a card with no parseable title instead of throwing", () => {
    const html = `<div id="vacancy1" data-href="/x__1.aspx" class="js_rowCard">no title here</div>`;
    expect(parseOfferCards(html)).toHaveLength(0);
  });
});

describe("normalizeId", () => {
  test("extracts the id from an InfoJobs job URL", () => {
    expect(
      normalizeId("https://www.infojobs.com.br/vaga-de-desenvolvedor-sr-java__11076372.aspx"),
    ).toBe("11076372");
  });
  test("passes through a bare id", () => {
    expect(normalizeId("11076372")).toBe("11076372");
  });
  test("returns null when no id-shaped number is present", () => {
    expect(normalizeId("not-an-id")).toBeNull();
  });
});

describe("parseJobDetail", () => {
  test("parses the JobPosting JSON-LD block, converting <br> to newlines", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@context": "http://schema.org",
        "@type": "JobPosting",
        "title": "Desenvolvedor Java",
        "description": "Linha 1<br>Linha 2<br>Par\\u00e1grafo final",
        "datePosted": "2025-11-03T10:56:00.0000000",
        "validThrough": "2026-10-06T11:26:00.0000000",
        "employmentType": "Jornada completa",
        "hiringOrganization": {"@type": "Organization", "name": "Drogaria Araujo"},
        "jobLocation": {"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": "Belo Horizonte", "addressRegion": "MG", "addressCountry": "BR"}}
      }
      </script>
    `;
    const job = parseJobDetail(html, "11076372");
    expect(job).not.toBeNull();
    expect(job?.title).toBe("Desenvolvedor Java");
    expect(job?.company).toBe("Drogaria Araujo");
    expect(job?.location).toBe("Belo Horizonte, MG");
    expect(job?.date).toBe("2025-11-03");
    expect(job?.validThrough).toBe("2026-10-06");
    expect(job?.employmentType).toBe("Jornada completa");
    expect(job?.description).toBe("Linha 1\nLinha 2\nParágrafo final");
  });

  test("handles jobLocation as a single object (not an array)", () => {
    const html = `
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "X", "jobLocation": {"address": {"addressLocality": "Curitiba", "addressRegion": "PR"}}}
      </script>
    `;
    const job = parseJobDetail(html, "1");
    expect(job?.location).toBe("Curitiba, PR");
  });

  test("returns null when no JobPosting JSON-LD block is present", () => {
    expect(parseJobDetail("<html><body>no data here</body></html>", "1")).toBeNull();
  });
});
