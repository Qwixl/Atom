import { describe, expect, it } from "vitest";
import { parseRssOrAtomFeed, type RssItemSummary } from "./rssFeed.js";
import { stripHtmlToText, validateConnectorHttpsUrl } from "./connectorUrl.js";

const RSS_SAMPLE = `<?xml version="1.0"?>
<rss><channel>
<item><title>First post</title><link>https://example.com/1</link><pubDate>Mon, 01 Jul 2026 10:00:00 GMT</pubDate></item>
<item><title>Second post</title><link>https://example.com/2</link><pubDate>Sun, 30 Jun 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM_SAMPLE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Atom item</title><link href="https://example.com/a"/><published>2026-07-01T09:00:00Z</published></entry>
</feed>`;

describe("rssFeed", () => {
  it("parses RSS items", () => {
    const items = parseRssOrAtomFeed(RSS_SAMPLE, "feed-1");
    expect(items.map((item) => item.title)).toEqual(["First post", "Second post"]);
    expect(items[0]?.link).toBe("https://example.com/1");
    expect(items[0]?.feedId).toBe("feed-1");
  });

  it("parses Atom entries", () => {
    const items = parseRssOrAtomFeed(ATOM_SAMPLE, "feed-2");
    expect(items).toEqual([
      {
        id: "feed-2-0",
        title: "Atom item",
        link: "https://example.com/a",
        published: "2026-07-01T09:00:00Z",
        feedId: "feed-2",
      } satisfies RssItemSummary,
    ]);
  });
});

describe("connectorUrl", () => {
  it("rejects private hosts", () => {
    expect(() => validateConnectorHttpsUrl("http://127.0.0.1/feed")).toThrow(/Private/);
  });

  it("strips HTML to text", () => {
    expect(stripHtmlToText("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });
});
