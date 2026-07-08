import { describe, expect, it } from "vitest";
import { formatRssContextForPrompt } from "./rssContext.js";

describe("formatRssContextForPrompt", () => {
  it("lists recent items when connected", () => {
    const text = formatRssContextForPrompt({
      connected: true,
      feedLabels: ["BBC Sport"],
      items: [{ id: "1", title: "City beat rivals", feedId: "f1", published: "2026-07-07" }],
    });
    expect(text).toContain("BBC Sport");
    expect(text).toContain("City beat rivals");
    expect(text).toContain("Optional owner RSS");
  });

  it("states not connected when no feeds", () => {
    const text = formatRssContextForPrompt({
      connected: false,
      items: [],
    });
    expect(text).toContain("Not connected");
  });
});
