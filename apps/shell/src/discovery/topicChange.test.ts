import { describe, expect, it } from "vitest";
import { isDiscoveryTopicChange } from "./topicChange.js";

describe("isDiscoveryTopicChange", () => {
  it("hides when free chat leaves the discovery subject", () => {
    expect(
      isDiscoveryTopicChange("what's todays weather?", "Jordan Henderson injury update", [
        "Jordan Henderson injury update",
      ]),
    ).toBe(true);
  });

  it("keeps path for short continuations", () => {
    expect(
      isDiscoveryTopicChange("tell me more about this", "Jordan Henderson injury update", [
        "Jordan Henderson injury update",
      ]),
    ).toBe(false);
  });

  it("ignores protocol / link-intent messages", () => {
    expect(
      isDiscoveryTopicChange(
        '[link-intent] {"url":"https://example.com","title":"X","intent":"explore"}',
        "X",
        ["X"],
      ),
    ).toBe(false);
  });
});
