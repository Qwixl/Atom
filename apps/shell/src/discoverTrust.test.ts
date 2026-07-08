import { describe, expect, it } from "vitest";
import { discoverTrustSignals, isCuratedDiscoverIndex } from "./discoverTrust.js";

describe("discoverTrust", () => {
  it("marks default shell indexes as curated", () => {
    expect(isCuratedDiscoverIndex({ label: "Business", url: "/business-index/index.json" })).toBe(
      true,
    );
    expect(isCuratedDiscoverIndex({ label: "Other", url: "https://evil.example/index.json" })).toBe(
      false,
    );
  });

  it("builds curated trust badges from verification tier", () => {
    const signals = discoverTrustSignals(
      {
        businessDomain: "coffee.example",
        verificationTier: 1,
        categories: ["café"],
        displayName: "Coffee Shop",
        kind: "community",
        publisherDid: "did:key:z6Mkatomexamples01",
      },
      "Community",
      "/community-index/index.json",
    );
    expect(signals.badge).toBe("curated");
    expect(signals.label).toMatch(/Verified|Curated/i);
  });

  it("marks non-default indexes as third-party or unverified", () => {
    const unverified = discoverTrustSignals(
      {
        businessDomain: "other.example",
        verificationTier: 0,
        categories: [],
        displayName: "Unknown",
      },
      "Custom",
      "https://other.example/index.json",
    );
    expect(unverified.badge).toBe("unverified");

    const arbitraryDid = discoverTrustSignals(
      {
        businessDomain: "spoof.example",
        verificationTier: 2,
        categories: [],
        displayName: "Spoof",
        publisherDid: "did:key:z6Mkanybody0000001",
      },
      "Custom",
      "https://other.example/index.json",
    );
    expect(arbitraryDid.badge).toBe("unverified");
  });
});
