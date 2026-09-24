import { describe, expect, test } from "bun:test";
import {
  slugify,
  buildSearchUrl,
  buildJobUrl,
  extractNextData,
  parseSearchResults,
  normalizeId,
  parseJobDetail,
} from "../src/helpers.js";

describe("slugify / buildSearchUrl", () => {
  test("slugifies a simple query", () => {
    expect(slugify("Flutter")).toBe("flutter");
  });
  test("builds the category-page URL", () => {
    expect(buildSearchUrl("Flutter")).toBe("https://arc.dev/remote-jobs/flutter");
  });
});

describe("buildJobUrl", () => {
  test("joins the title slug and id", () => {
    expect(buildJobUrl("eltropy-senior-mobile-developer-remote", "ph3excboow")).toBe(
      "https://arc.dev/remote-jobs/j/eltropy-senior-mobile-developer-remote-ph3excboow",
    );
  });
});

describe("extractNextData", () => {
  test("parses the __NEXT_DATA__ JSON blob out of a page", () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"categoryUrlString":"flutter"}}}</script></body></html>`;
    const data = extractNextData(html);
    expect(data?.props?.pageProps?.categoryUrlString).toBe("flutter");
  });
  test("returns null when no __NEXT_DATA__ script is present", () => {
    expect(extractNextData("<html><body>nothing here</body></html>")).toBeNull();
  });
  test("returns null on malformed JSON instead of throwing", () => {
    const html = `<script id="__NEXT_DATA__">{not valid json</script>`;
    expect(extractNextData(html)).toBeNull();
  });
});

// Fixture shaped like real Arc.dev pageProps (captured 2026-09-04).
const REAL_CATEGORY_PAGE_PROPS = {
  categoryUrlString: "flutter",
  arcJobs: [
    {
      randomKey: "pd1r8ash8a",
      title: "Mid Backend Developer (Firebase) - Part-time - APAC/EMEA",
      urlString: "mid-backend-developer-firebase-part-time-apac-emea",
      postedAt: 1788349000,
      requiredCountries: ["RU", "TK", "DK"],
      company: { randomKey: "x", urlString: "acme", name: "Acme Remote" },
    },
  ],
  externalJobs: [
    {
      randomKey: "ph3excboow",
      title: "Senior Mobile Developer (Remote)",
      urlString: "eltropy-senior-mobile-developer-remote",
      postedAt: 1788349735,
      requiredCountries: ["IN"],
      company: { randomKey: "y", urlString: "eltropy", name: "Eltropy" },
    },
    {
      // No requiredCountries at all -> "Worldwide"
      randomKey: "abc1234567",
      title: "Flutter Engineer",
      urlString: "some-company-flutter-engineer",
      postedAt: 1788000000,
      requiredCountries: [],
      company: { randomKey: "z", urlString: "somecompany", name: "Some Company" },
    },
  ],
};

// Fallback page: Arc redirects an unrecognized category slug here instead of 404ing.
const FALLBACK_LISTING_PAGE_PROPS = {
  categoryUrlString: null,
  arcJobs: [{ randomKey: "x", title: "Unrelated Job", urlString: "unrelated-job", postedAt: 1, requiredCountries: [], company: { name: "X" } }],
  externalJobs: [],
};

describe("parseSearchResults", () => {
  test("parses arcJobs and externalJobs into JobCards with source tags", () => {
    const cards = parseSearchResults(REAL_CATEGORY_PAGE_PROPS);
    expect(cards).toHaveLength(3);

    expect(cards[0].id).toBe("pd1r8ash8a");
    expect(cards[0].source).toBe("arc");
    expect(cards[0].location).toBe("RU, TK, DK");

    expect(cards[1].id).toBe("ph3excboow");
    expect(cards[1].source).toBe("external");
    expect(cards[1].title).toBe("Senior Mobile Developer (Remote)");
    expect(cards[1].company).toBe("Eltropy");
    expect(cards[1].location).toBe("IN");
    expect(cards[1].date).toBe("2026-09-02");
    expect(cards[1].url).toBe("https://arc.dev/remote-jobs/j/eltropy-senior-mobile-developer-remote-ph3excboow");

    expect(cards[2].location).toBe("Worldwide");
  });

  // Regression: Arc silently redirects an unmatched category slug to the generic,
  // unfiltered /remote-jobs firehose rather than 404ing or returning nothing. Without
  // checking categoryUrlString, every unrecognized query would silently return that
  // firehose's jobs as if they matched — exactly the "discarded filter" failure mode
  // the portal-skill contract says must never happen silently.
  test("returns empty results for the fallback (unmatched-category) page shape", () => {
    expect(parseSearchResults(FALLBACK_LISTING_PAGE_PROPS)).toHaveLength(0);
  });

  test("returns empty results for missing/undefined pageProps", () => {
    expect(parseSearchResults(undefined)).toHaveLength(0);
    expect(parseSearchResults(null)).toHaveLength(0);
  });

  test("skips a raw entry missing required fields instead of throwing", () => {
    const cards = parseSearchResults({
      categoryUrlString: "flutter",
      arcJobs: [{ title: "No id or urlString" }],
      externalJobs: [],
    });
    expect(cards).toHaveLength(0);
  });
});

describe("normalizeId", () => {
  test("passes through a bare id", () => {
    expect(normalizeId("ph3excboow")).toBe("ph3excboow");
  });
  test("extracts the trailing id segment from a full job URL", () => {
    expect(
      normalizeId("https://arc.dev/remote-jobs/j/eltropy-senior-mobile-developer-remote-ph3excboow"),
    ).toBe("ph3excboow");
  });
  test("extracts the trailing id segment from a bare slug", () => {
    expect(normalizeId("some-title-here-abc123")).toBe("abc123");
  });
});

describe("parseJobDetail", () => {
  test("parses an external job's pageProps, converting <br>/tags without collapsing newlines", () => {
    const pageProps = {
      job: {
        title: "Senior Mobile Developer (Remote)",
        companyName: "Eltropy",
        urlString: "eltropy-senior-mobile-developer-remote",
        postedAt: 1788349735,
        requiredCountries: ["IN"],
        contractType: "permanent",
        url: "https://in.linkedin.com/jobs/view/senior-mobile-developer-remote-at-eltropy-4449107371",
        description: "<strong>About Us</strong>\n\nWe build things.\n\n*   Bullet one\n*   Bullet two",
      },
    };
    const job = parseJobDetail(pageProps, "ph3excboow");
    expect(job).not.toBeNull();
    expect(job?.title).toBe("Senior Mobile Developer (Remote)");
    expect(job?.company).toBe("Eltropy");
    expect(job?.location).toBe("IN");
    expect(job?.source).toBe("external");
    expect(job?.externalUrl).toBe(
      "https://in.linkedin.com/jobs/view/senior-mobile-developer-remote-at-eltropy-4449107371",
    );
    expect(job?.description).toBe("About Us\n\nWe build things.\n\n*   Bullet one\n*   Bullet two");
  });

  test("returns null when pageProps has no job (arc-native detail redirect case)", () => {
    expect(parseJobDetail({ arcJobs: [], externalJobs: [] }, "x")).toBeNull();
    expect(parseJobDetail(undefined, "x")).toBeNull();
  });
});
