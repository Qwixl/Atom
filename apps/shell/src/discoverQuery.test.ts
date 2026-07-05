import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractDiscoverTerms, isDiscoverQuery } from "./discoverQuery.ts";

describe("discoverQuery", () => {
  it("detects discover intent", () => {
    assert.equal(isDiscoverQuery("Find a coffee shop"), true);
    assert.equal(isDiscoverQuery("@coffee-shop"), true);
    assert.equal(isDiscoverQuery("Schedule a team standup"), false);
  });

  it("extracts search terms", () => {
    assert.equal(extractDiscoverTerms("Find a coffee shop"), "coffee shop");
    assert.equal(extractDiscoverTerms("@coffee-shop"), "@coffee-shop");
  });
});
