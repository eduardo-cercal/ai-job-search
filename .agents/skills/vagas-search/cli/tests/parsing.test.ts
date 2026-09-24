import { describe, expect, test } from "bun:test";
import {
  slugify,
  buildSearchUrl,
  parseOfferCards,
  parseBRDate,
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
      "https://www.vagas.com.br/vagas-de-desenvolvedor-flutter",
    );
  });
  test("adds the e[] location facet param", () => {
    expect(buildSearchUrl("analista", "São Paulo", 1)).toBe(
      "https://www.vagas.com.br/vagas-de-analista?e%5B%5D=S%C3%A3o+Paulo",
    );
  });
  test("adds a page param for page > 1", () => {
    expect(buildSearchUrl("analista", undefined, 2)).toBe(
      "https://www.vagas.com.br/vagas-de-analista?page=2",
    );
  });
});

// Fixture based on real Vagas.com search-results markup (captured 2026-09-04).
const CARD_FIXTURE = `
<li class="vaga odd ">
  <header class="clearfix">
    <div class="informacoes-adicionais-header clearfix">
          <figure class="logoEmpresa haslogo">
            <img alt="Logo da empresa HStern" src="https://site.vagas.com.br/img/logosMkt/lgc29820221797.gif" />
        </figure>
    </div>
    <div class="informacoes-header">
      <h2 class="cargo">
        <a class="link-detalhes-vaga" data-id-vaga="2824782" title="Desenvolvedor de Software Jr" id="v2824782" onclick="ga('send', 'event', 'Pesquisa', 'Vaga_Visualizada');" href="/vagas/v2824782/desenvolvedor-de-software-jr">
            <mark>Desenvolvedor</mark> de Software Jr
</a>      </h2>
      <span class="emprVaga">
          HStern
      </span>
      <div class="nivelQtdVagas">
          <span class="nivelVaga">
            Júnior/Trainee
          </span>
      </div>
    </div>
  </header>
  <div class="detalhes">
    <p>Descrição: Desenvolvedor Júnior de Software | HStern...</p>
  </div>
    <footer>
          <div class="vaga-local">
            <i class="bx bx-map"></i>
            Rio de Janeiro / RJ
              <div class="tooltip-place" role="tooltip" aria-labelledby="tooltip-place">
                <i class='bx bx-info-circle'></i>
                <div class="tooltip-text">
                    <div id="tooltip-place">
                      A empresa aceita candidaturas de Rio de Janeiro e cidades próximas
                    </div>
                </div>
              </div>
          </div>
          <span class="data-publicacao"><i class="bx bx-time-five"></i>11/08/2026</span>
    </footer>
</li>
<li class="vaga even ">
  <header class="clearfix">
    <div class="informacoes-header">
      <h2 class="cargo">
        <a class="link-detalhes-vaga" data-id-vaga="2829428" title="Analista de Marketing" id="v2829428" href="/vagas/v2829428/analista-de-marketing">
            <mark>Analista</mark> de Marketing
</a>      </h2>
      <span class="emprVaga">
          Confidencial
      </span>
      <div class="nivelQtdVagas">
          <span class="nivelVaga">
            Pleno
          </span>
      </div>
    </div>
  </header>
    <footer>
          <div class="vaga-local">
            <i class="bx bx-map"></i>
            São Bernardo do Campo / SP
              <div class="tooltip-place" role="tooltip">
              </div>
          </div>
          <span class="data-publicacao"><i class="bx bx-time-five"></i>07/08/2026</span>
    </footer>
</li>
`;

describe("parseOfferCards", () => {
  test("parses id, title, url, company, location, date from real markup shape", () => {
    const cards = parseOfferCards(CARD_FIXTURE);
    expect(cards).toHaveLength(2);

    expect(cards[0].id).toBe("2824782");
    expect(cards[0].title).toBe("Desenvolvedor de Software Jr");
    expect(cards[0].url).toBe("https://www.vagas.com.br/vagas/v2824782/desenvolvedor-de-software-jr");
    expect(cards[0].company).toBe("HStern");
    // Location must not be truncated by the nested tooltip <div> that follows it.
    expect(cards[0].location).toBe("Rio de Janeiro / RJ");
    expect(cards[0].date).toBe("11/08/2026");

    expect(cards[1].id).toBe("2829428");
    expect(cards[1].company).toBe("Confidencial");
    expect(cards[1].location).toBe("São Bernardo do Campo / SP");
    expect(cards[1].date).toBe("07/08/2026");
  });

  test("skips a chunk with no parseable link instead of throwing", () => {
    const cards = parseOfferCards(`<li class="vaga odd ">no link here</li>`);
    expect(cards).toHaveLength(0);
  });

  test("returns an empty list for markup with no vaga items", () => {
    expect(parseOfferCards("<html><body>no jobs</body></html>")).toHaveLength(0);
  });
});

describe("parseBRDate", () => {
  test("converts DD/MM/YYYY to ISO", () => {
    expect(parseBRDate("11/08/2026")).toBe("2026-08-11");
  });
  test("returns null for unrecognized text", () => {
    expect(parseBRDate("???")).toBeNull();
    expect(parseBRDate(null)).toBeNull();
  });
});

describe("parseTotalCount", () => {
  test("parses the plural h1 count", () => {
    expect(parseTotalCount("<h1>746 vagas de emprego para analista</h1>")).toBe(746);
  });
  test("parses the singular h1 count", () => {
    expect(parseTotalCount("<h1>1 vaga de emprego para desenvolvedor flutter</h1>")).toBe(1);
  });
  test("returns null when the phrase is absent", () => {
    expect(parseTotalCount("<html></html>")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("extracts the id from a full detail URL", () => {
    expect(normalizeId("https://www.vagas.com.br/vagas/v2824782/desenvolvedor-de-software-jr")).toBe(
      "2824782",
    );
  });
  test("passes through a bare id", () => {
    expect(normalizeId("2824782")).toBe("2824782");
  });
  test("returns null when no id-shaped number is present", () => {
    expect(normalizeId("not-an-id")).toBeNull();
  });
});

// Fixture based on real Vagas.com detail-page markup (captured 2026-09-04).
const DETAIL_FIXTURE = `
<div class="job-shortdescription__column job-shortdescription__column--second">
  <h1 class="job-shortdescription__title">
    Desenvolvedor de Software Jr
  </h1>
  <div>
    <h2 class="job-shortdescription__company">
      HStern
    </h2>
  </div>
</div>
<header>
  <div class="infoVaga">
    <ul class="clearfix">
      <li>
        <div>
          <span>Faixa salarial</span>
          <span>a combinar</span>
        </div>
      </li>
      <li>
        <div>
            <span class="info-localizacao">
              Rio de Janeiro
                  <div class="tooltip-place" role="tooltip">
                  </div>
            </span>
        </div>
      </li>
      <li>
        <div>
          <span class="info-modelo-contratual" title="Regime CLT">
            Regime CLT
          </span>
        </div>
      </li>
    </ul>
  </div>
</header>
<ul class="job-breadcrumb">
  <li class="job-breadcrumb__item job-breadcrumb__item--published job-breadcrumb__item--nostyle">
    <span><i class='bx bx-time'></i></span>
    Publicada em 11/08/2026
  </li>
  <li class="job-breadcrumb__item job-breadcrumb__item--id">
    v2824782
  </li>
</ul>
<div class="job-tab-content job-description__text texto" data-testid="JobDescription">
  <br><b>Descrição</b>: <p><strong>Desenvolvedor Júnior de Software | HStern</strong></p><p><br></p><p>Na HStern, a tecnologia é parte fundamental.</p><p><br></p><p><strong>Requisitos</strong></p><p><br></p><p>•	Graduado em Ciência da Computação.</p>
</div>
`;

describe("parseJobDetail", () => {
  test("parses title, company, location, employment type, salary, date, description from real markup shape", () => {
    const job = parseJobDetail(DETAIL_FIXTURE, "2824782");
    expect(job).not.toBeNull();
    expect(job?.title).toBe("Desenvolvedor de Software Jr");
    expect(job?.company).toBe("HStern");
    // Location must not be truncated by the nested tooltip <div> that follows it.
    expect(job?.location).toBe("Rio de Janeiro");
    expect(job?.employmentType).toBe("Regime CLT");
    expect(job?.salary).toBe("a combinar");
    expect(job?.date).toBe("2026-08-11");
    expect(job?.description).toContain("Desenvolvedor Júnior de Software");
    expect(job?.description).toContain("Requisitos");
    expect(job?.description).not.toContain("<");
  });

  test("returns null when no title heading is present", () => {
    expect(parseJobDetail("<html><body>no data here</body></html>", "1")).toBeNull();
  });
});
