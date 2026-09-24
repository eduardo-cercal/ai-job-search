import { describe, expect, test } from "bun:test";
import { parseFeedItems, parsePubDate, filterCardsByQuery, normalizeId } from "../src/helpers.js";

// Fixture based on real We Work Remotely RSS markup (captured 2026-09-04), trimmed to
// short descriptions but preserving the exact tag set and RSS/XML-escaping style.
const FEED_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>We Work Remotely: Remote jobs in design, programming, marketing and more</title>
<item>
  <media:content url="https://wwr-pro.s3.amazonaws.com/logos/0171/6209/logo.gif" type="image/png"/>
  <title>Lemon.io: Senior React Native Developer</title>
  <region>Anywhere in the World</region>
  <country></country>
  <state></state>
  <skills>Node.js, React, Engineer, Developer, Mobile, React Native, and Mobile Development</skills>
  <category>Full-Stack Programming</category>
  <type>Full-Time</type>
  <description>&lt;p&gt;We need a senior mobile engineer.&amp;nbsp;Experience with React Native required; Flutter experience is a &lt;strong&gt;plus&lt;/strong&gt;.&lt;/p&gt;
&lt;ul&gt;
&lt;li&gt;Ship features fast&lt;/li&gt;
&lt;li&gt;Own the mobile release pipeline&lt;/li&gt;
&lt;/ul&gt;</description>
  <pubDate>Fri, 04 Sep 2026 12:00:00 +0000</pubDate>
  <expires></expires>
  <guid>https://weworkremotely.com/remote-jobs/lemonio-senior-react-native-developer</guid>
  <link>https://weworkremotely.com/remote-jobs/lemonio-senior-react-native-developer</link>
</item>
<item>
  <media:content url="https://wwr-pro.s3.amazonaws.com/logos/0000/0000/logo.gif" type="image/png"/>
  <title>Secret: Head of Sales and Customer Success</title>
  <region>Anywhere in the World</region>
  <country></country>
  <state>Nouvelle-Aquitaine</state>
  <skills>Sales and  Client Relationship Management</skills>
  <category>Sales and Marketing</category>
  <type>Full-Time</type>
  <description>&lt;p&gt;Lead our sales team.&lt;/p&gt;</description>
  <pubDate>Fri, 04 Sep 2026 18:52:20 +0000</pubDate>
  <expires></expires>
  <guid>https://weworkremotely.com/remote-jobs/secret-head-of-sales-and-customer-success</guid>
  <link>https://weworkremotely.com/remote-jobs/secret-head-of-sales-and-customer-success</link>
</item>
</channel>
</rss>
`;

describe("parseFeedItems", () => {
  test("parses id, title, company, location, category, skills, type, date, description from real markup shape", () => {
    const items = parseFeedItems(FEED_FIXTURE);
    expect(items).toHaveLength(2);

    expect(items[0].id).toBe("lemonio-senior-react-native-developer");
    // "Company: Role" splits on the first ": " only.
    expect(items[0].company).toBe("Lemon.io");
    expect(items[0].title).toBe("Senior React Native Developer");
    expect(items[0].location).toBe("Anywhere in the World");
    expect(items[0].category).toBe("Full-Stack Programming");
    expect(items[0].skills).toContain("React Native");
    expect(items[0].employmentType).toBe("Full-Time");
    expect(items[0].date).toBe("2026-09-04");
    expect(items[0].url).toBe("https://weworkremotely.com/remote-jobs/lemonio-senior-react-native-developer");
    // Description is double-decoded (RSS escaping, then the real HTML's own entities)
    // and tags are stripped to plain text.
    expect(items[0].description).toContain("senior mobile engineer");
    expect(items[0].description).toContain("Flutter experience is a plus");
    expect(items[0].description).not.toContain("<");
    expect(items[0].description).not.toContain("&amp;nbsp;");

    expect(items[1].id).toBe("secret-head-of-sales-and-customer-success");
    expect(items[1].company).toBe("Secret");
    expect(items[1].title).toBe("Head of Sales and Customer Success");
  });

  test("returns an empty list for markup with no items", () => {
    expect(parseFeedItems("<rss><channel></channel></rss>")).toHaveLength(0);
  });

  test("skips an item with no link instead of throwing", () => {
    const noLink = `<item><title>Foo: Bar</title></item>`;
    expect(parseFeedItems(noLink)).toHaveLength(0);
  });
});

describe("parsePubDate", () => {
  test("converts an RFC-2822 pubDate to ISO", () => {
    expect(parsePubDate("Fri, 04 Sep 2026 12:00:00 +0000")).toBe("2026-09-04");
  });
  test("returns null for unparseable or missing input", () => {
    expect(parsePubDate("not a date")).toBeNull();
    expect(parsePubDate(null)).toBeNull();
  });
});

describe("filterCardsByQuery", () => {
  const items = parseFeedItems(FEED_FIXTURE);

  test("matches on title", () => {
    const filtered = filterCardsByQuery(items, "sales");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("secret-head-of-sales-and-customer-success");
  });

  test("matches on description text even when title and skills omit the term", () => {
    // Neither the title nor the skills field for this listing contains "flutter" — only
    // the description does (mentioned as a nearby/alternative technology).
    const filtered = filterCardsByQuery(items, "flutter");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("lemonio-senior-react-native-developer");
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
  test("extracts the slug from a full job URL", () => {
    expect(
      normalizeId("https://weworkremotely.com/remote-jobs/lemonio-senior-react-native-developer"),
    ).toBe("lemonio-senior-react-native-developer");
  });
  test("passes through a bare slug", () => {
    expect(normalizeId("lemonio-senior-react-native-developer")).toBe("lemonio-senior-react-native-developer");
  });
  test("returns null for a string with characters no valid slug would contain", () => {
    expect(normalizeId("not a valid slug!")).toBeNull();
  });
});
