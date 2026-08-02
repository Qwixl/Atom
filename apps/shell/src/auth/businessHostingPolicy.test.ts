import { describe, expect, it } from "vitest";
import {
  assertBusinessHosting,
  businessHostingDefaults,
  BUSINESS_BILLING_LANE,
  BUSINESS_READINESS_SKU,
} from "./businessHostingPolicy.js";

describe("businessHostingPolicy", () => {
  it("allows personal on any lane", () => {
    expect(
      assertBusinessHosting({
        accountType: "user",
        billingLane: "byok",
        readinessSkuId: "on_when_needed",
      }),
    ).toBeNull();
  });

  it("rejects Business + BYOK", () => {
    expect(
      assertBusinessHosting({
        accountType: "business",
        billingLane: "byok",
        readinessSkuId: "open_for_business",
      }),
    ).toMatch(/Atom-hosted Standard only/);
  });

  it("rejects Business + self_hosted", () => {
    expect(
      assertBusinessHosting({
        accountType: "business",
        billingLane: "self_hosted",
      }),
    ).toMatch(/Atom-hosted Standard only/);
  });

  it("rejects Business + wrong readiness", () => {
    expect(
      assertBusinessHosting({
        accountType: "business",
        billingLane: "standard",
        readinessSkuId: "on_when_needed",
      }),
    ).toMatch(/Open for business/);
  });

  it("allows Business Standard + open_for_business", () => {
    expect(
      assertBusinessHosting({
        accountType: "business",
        billingLane: BUSINESS_BILLING_LANE,
        readinessSkuId: BUSINESS_READINESS_SKU,
      }),
    ).toBeNull();
  });

  it("defaults lock Standard Always-On", () => {
    expect(businessHostingDefaults()).toEqual({
      billingLane: "standard",
      readinessSkuId: "open_for_business",
      hosting: "hosted",
    });
  });
});
