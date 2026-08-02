import { describe, expect, it } from "vitest";
import {
  formatModulePrice,
  modulePriceLabel,
  normalizeModulePricing,
  validateModulePricing,
} from "./pricing.js";

describe("module pricing", () => {
  it("defaults to free when omitted", () => {
    expect(normalizeModulePricing(undefined)).toEqual({ model: "free" });
    expect(formatModulePrice(undefined)).toBe("Free");
  });

  it("validates paid listing", () => {
    const pricing = validateModulePricing(
      {
        model: "paid",
        priceCents: 499,
        purchaseUrl: "https://store.example.com/checkout/widget",
      },
      "acme/widget",
    );
    expect(pricing?.model).toBe("paid");
    expect(formatModulePrice(pricing)).toBe("$4.99");
  });

  it("rejects paid without purchaseUrl", () => {
    expect(() =>
      validateModulePricing({ model: "paid", priceCents: 100 }, "acme/widget"),
    ).toThrow(/purchaseUrl/);
  });

  it("labels paid modules with the list price only", () => {
    expect(
      modulePriceLabel({
        model: "paid",
        priceCents: 999,
        currency: "USD",
        purchaseUrl: "https://store.example.com/x",
      }),
    ).toBe("$9.99");
  });
});
