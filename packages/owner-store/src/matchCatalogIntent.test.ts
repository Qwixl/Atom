import { describe, expect, it } from "vitest";
import { matchCatalogForIntent } from "./matchCatalogIntent.js";
import type { BusinessCatalogItemValue } from "./businessSchema.js";

const catalog: BusinessCatalogItemValue[] = [
  {
    catalogItemId: "room-standard",
    label: "Standard room",
    amount: { currency: "EUR", amountMinor: 8900 },
    available: true,
    tags: ["hotel", "double"],
    terms: ["Breakfast included"],
  },
  {
    catalogItemId: "room-suite",
    label: "Suite",
    amount: { currency: "EUR", amountMinor: 18900 },
    available: true,
    tags: ["hotel", "luxury"],
  },
];

describe("matchCatalogForIntent", () => {
  it("matches exact catalogItemId", () => {
    const intent = { intentId: "i1", catalogItemId: "room-standard" };
    expect(matchCatalogForIntent(catalog, intent)?.item.catalogItemId).toBe("room-standard");
  });

  it("matches query tokens", () => {
    const intent = { query: "luxury suite hotel" };
    expect(matchCatalogForIntent(catalog, intent)?.item.catalogItemId).toBe("room-suite");
  });

  it("respects max amount constraint", () => {
    const intent = {
      query: "suite",
      constraints: { maxAmountMinor: 10000, currency: "EUR" },
    };
    expect(matchCatalogForIntent(catalog, intent)).toBeUndefined();
  });
});
