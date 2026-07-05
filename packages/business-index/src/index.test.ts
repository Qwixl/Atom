import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterBusinessIndex, attachHandlesToEntries, type BusinessIndex } from "./index.js";

const sample: BusinessIndex = {
  indexVersion: 1,
  updatedAt: "2026-07-04T00:00:00Z",
  businesses: [
    {
      agentCardUrl: "https://plumber.example/a2a/jsonrpc",
      did: "did:key:plumber",
      businessDomain: "plumber.example",
      verificationTier: 1,
      categories: ["plumbing", "home-services"],
      serviceArea: "London",
      displayName: "Acme Plumbing",
    },
    {
      agentCardUrl: "https://cafe.example/a2a/jsonrpc",
      did: "did:key:cafe",
      businessDomain: "cafe.example",
      verificationTier: 1,
      categories: ["food"],
      displayName: "Corner Cafe",
      sponsored: true,
      sponsoredRank: 1,
    },
  ],
};

describe("filterBusinessIndex", () => {
  it("filters by category and terms", () => {
    const results = filterBusinessIndex(sample, { categories: ["plumbing"], terms: "acme" });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.displayName, "Acme Plumbing");
  });

  it("filters by kind", () => {
    const index: BusinessIndex = {
      indexVersion: 1,
      updatedAt: "2026-07-04T00:00:00Z",
      businesses: [
        {
          agentCardUrl: "https://coffee.example/a2a/jsonrpc",
          did: "did:key:coffee",
          businessDomain: "coffee.example",
          verificationTier: 1,
          categories: ["community"],
          displayName: "Coffee Shop",
          kind: "community",
        },
        ...sample.businesses,
      ],
    };
    const results = filterBusinessIndex(index, { kind: "community" });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.displayName, "Coffee Shop");
  });

  it("attaches handles from handle index", () => {
    const entries = [
      {
        businessDomain: "coffee-shop.agents.qwixl.dev",
        verificationTier: 1,
        categories: ["community"],
        displayName: "Qwixl Coffee Shop",
        kind: "community" as const,
        moduleIds: ["community/coffee-shop"],
      },
    ];
    const withHandles = attachHandlesToEntries(entries, [
      {
        handle: "@coffee-shop",
        businessDomain: "coffee-shop.agents.qwixl.dev",
        moduleIds: ["community/coffee-shop"],
      },
    ]);
    assert.equal(withHandles[0]?.handle, "@coffee-shop");
  });
});
