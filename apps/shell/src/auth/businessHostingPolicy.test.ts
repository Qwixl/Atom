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
    ).toMatch(/hosted plan/);
  });

  it("rejects Business + self_hosted", () => {
    expect(
      assertBusinessHosting({
        accountType: "business",
        billingLane: "self_hosted",
      }),
    ).toMatch(/hosted plan/);
  });

  it("rejects Business + wrong readiness", () => {
    expect(
      assertBusinessHosting({
        accountType: "business",
        billingLane: "standard",
        readinessSkuId: "on_when_needed",
      }),
    ).toMatch(/customers/);
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

  it("rejects Personal open_for_business", () => {
    expect(
      assertBusinessHosting({
        accountType: "user",
        billingLane: "standard",
        readinessSkuId: "open_for_business",
      }),
    ).toMatch(/Business accounts/);
  });

  it("rejects Developer open_for_business", () => {
    expect(
      assertBusinessHosting({
        accountType: "developer",
        billingLane: "byok",
        readinessSkuId: "open_for_business",
      }),
    ).toMatch(/Business accounts/);
  });

  it("defaults lock Standard Always-On", () => {
    expect(businessHostingDefaults()).toEqual({
      billingLane: "standard",
      readinessSkuId: "open_for_business",
      hosting: "hosted",
    });
  });
});
