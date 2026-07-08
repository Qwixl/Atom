import { describe, expect, it } from "vitest";
import { buildGoogleNewsSearchUrl } from "./newsSearchFeed.js";

describe("newsSearchFeed", () => {
  it("builds Google News RSS search URL", () => {
    const url = buildGoogleNewsSearchUrl("political news");
    expect(url).toContain("news.google.com/rss/search");
    expect(url).toContain("political");
  });
});
