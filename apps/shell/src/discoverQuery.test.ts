import { describe, expect, it } from "vitest";
import { extractDiscoverTerms, isDiscoverQuery } from "./discoverQuery.js";

describe("discoverQuery", () => {
  it("detects discover intent", () => {
    expect(isDiscoverQuery("Find a coffee shop")).toBe(true);
    expect(isDiscoverQuery("@coffee-shop")).toBe(true);
    expect(isDiscoverQuery("Schedule a team standup")).toBe(false);
  });

  it("extracts search terms", () => {
    expect(extractDiscoverTerms("Find a coffee shop")).toBe("coffee shop");
    expect(extractDiscoverTerms("@coffee-shop")).toBe("@coffee-shop");
  });
});
