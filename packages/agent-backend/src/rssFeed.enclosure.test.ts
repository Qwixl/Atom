import { describe, expect, it } from "vitest";
import { parseRssOrAtomFeed } from "./rssFeed.js";

describe("rssFeed enclosures", () => {
  it("parses RSS enclosure url and type", () => {
    const xml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Episode 1</title>
    <enclosure url="https://cdn.example.com/ep1.mp3" type="audio/mpeg"/>
    <pubDate>Wed, 08 Jul 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;
    const items = parseRssOrAtomFeed(xml, "feed-1");
    expect(items[0]).toMatchObject({
      title: "Episode 1",
      enclosureUrl: "https://cdn.example.com/ep1.mp3",
      enclosureType: "audio/mpeg",
    });
  });
});
