import { describe, expect, test } from "bun:test";
import { parseFeedItems, filterCardsByQuery, normalizeId } from "../src/helpers.js";

// Fixture based on real Himalayas RSS markup (captured 2026-09-10), trimmed to
// short descriptions but preserving the exact tag set and CDATA-escaping style.
const FEED_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0" xmlns:himalayasJobs="https://himalayas.app/ns/jobs" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title><![CDATA[Remote jobs from Himalayas]]></title>
<item>
  <title><![CDATA[Senior Flutter Engineer]]></title>
  <description><![CDATA[We need a senior mobile engineer with Flutter experience.]]></description>
  <link>https://himalayas.app/companies/acme/jobs/senior-flutter-engineer</link>
  <guid isPermaLink="true">https://himalayas.app/companies/acme/jobs/senior-flutter-engineer</guid>
  <category><![CDATA[Senior-Flutter-Engineer]]></category>
  <category><![CDATA[Mobile-Development]]></category>
  <pubDate>Thu, 10 Sep 2026 02:43:32 GMT</pubDate>
  <himalayasJobs:companyName>Acme Inc</himalayasJobs:companyName>
  <himalayasJobs:locationRestriction>Canada</himalayasJobs:locationRestriction>
  <himalayasJobs:locationRestriction>United States</himalayasJobs:locationRestriction>
  <content:encoded><![CDATA[<h3>About Acme</h3><p>We build things.</p><ul><li><p>Ship Flutter features fast</p></li><li><p>Own the mobile release pipeline</p></li></ul>]]></content:encoded>
  <himalayasJobs:expiryDate>Mon, 09 Nov 2026 02:43:31 GMT</himalayasJobs:expiryDate>
  <guid>https://himalayas.app/companies/acme/jobs/senior-flutter-engineer</guid>
</item>
<item>
  <title><![CDATA[Head of Sales]]></title>
  <description><![CDATA[Lead our sales team.]]></description>
  <link>https://himalayas.app/companies/secret/jobs/head-of-sales</link>
  <guid isPermaLink="true">https://himalayas.app/companies/secret/jobs/head-of-sales</guid>
  <category><![CDATA[Sales]]></category>
  <pubDate>Thu, 10 Sep 2026 01:00:00 GMT</pubDate>
  <himalayasJobs:companyName>Secret</himalayasJobs:companyName>
  <content:encoded><![CDATA[<p>Lead our worldwide sales team, no location restriction.</p>]]></content:encoded>
  <guid>https://himalayas.app/companies/secret/jobs/head-of-sales</guid>
</item>
</channel>
</rss>
`;

describe("parseFeedItems", () => {
  test("parses id, title, company, location, categories, date, deadline, description from real markup shape", () => {
    const items = parseFeedItems(FEED_FIXTURE);
    expect(items).toHaveLength(2);

    expect(items[0].id).toBe("acme/senior-flutter-engineer");
    expect(items[0].title).toBe("Senior Flutter Engineer");
    expect(items[0].company).toBe("Acme Inc");
    expect(items[0].location).toBe("Canada, United States");
    expect(items[0].categories).toBe("Senior-Flutter-Engineer, Mobile-Development");
    expect(items[0].date).toBe("2026-09-10");
    expect(items[0].deadline).toBe("2026-11-09");
    expect(items[0].url).toBe("https://himalayas.app/companies/acme/jobs/senior-flutter-engineer");
    // content:encoded is CDATA-wrapped HTML - tags stripped, block breaks kept as newlines.
    expect(items[0].description).toContain("About Acme");
    expect(items[0].description).toContain("Ship Flutter features fast");
    expect(items[0].description).not.toContain("<");
  });

  test("a job with no locationRestriction has a null location (worldwide-eligible)", () => {
    const items = parseFeedItems(FEED_FIXTURE);
    expect(items[1].location).toBeNull();
    expect(items[1].deadline).toBeNull();
  });

  test("returns an empty list for markup with no items", () => {
    expect(parseFeedItems("<rss><channel></channel></rss>")).toHaveLength(0);
  });

  test("skips an item with no link instead of throwing", () => {
    const noLink = `<item><title><![CDATA[Foo]]></title></item>`;
    expect(parseFeedItems(noLink)).toHaveLength(0);
  });
});

describe("filterCardsByQuery", () => {
  const items = parseFeedItems(FEED_FIXTURE);

  test("matches on title", () => {
    const filtered = filterCardsByQuery(items, "sales");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("secret/head-of-sales");
  });

  test("matches on description text even when title omits the term", () => {
    const filtered = filterCardsByQuery(items, "flutter");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("acme/senior-flutter-engineer");
  });

  test("multi-word query requires every word to match (AND, not OR)", () => {
    expect(filterCardsByQuery(items, "flutter sales")).toHaveLength(0);
  });

  test("is case-insensitive", () => {
    expect(filterCardsByQuery(items, "FLUTTER")).toHaveLength(1);
  });

  test("returns an empty list when nothing matches", () => {
    expect(filterCardsByQuery(items, "cobol")).toHaveLength(0);
  });
});

describe("normalizeId", () => {
  test("extracts the company-slug/job-slug composite from a full job URL", () => {
    expect(normalizeId("https://himalayas.app/companies/acme/jobs/senior-flutter-engineer")).toBe(
      "acme/senior-flutter-engineer",
    );
  });
  test("passes through a bare composite id", () => {
    expect(normalizeId("acme/senior-flutter-engineer")).toBe("acme/senior-flutter-engineer");
  });
  test("returns null for a string with no slash (not a valid composite)", () => {
    expect(normalizeId("not-a-composite-id")).toBeNull();
  });
  test("returns null for a string with characters no valid slug would contain", () => {
    expect(normalizeId("not a valid/slug!")).toBeNull();
  });
});
