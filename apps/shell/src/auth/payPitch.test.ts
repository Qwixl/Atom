import { describe, expect, it } from "vitest";
import { payPitchFor } from "./payPitch.js";
import {
  clampReadinessForAccount,
  notificationLabel,
  payChangeReadinessOptions,
} from "./planLanes.js";

describe("payPitchFor", () => {
  it("sells Business merchant entitlements without apology copy", () => {
    const p = payPitchFor({
      accountType: "business",
      lane: "standard",
      readinessSkuId: "open_for_business",
    });
    expect(p.benefits.some((b) => /Brand|Policies|FAQ|Catalog/i.test(b))).toBe(true);
    expect(p.benefits.some((b) => /Stripe Checkout/i.test(b))).toBe(true);
    expect(p.benefits.some((b) => /transaction fee/i.test(b))).toBe(true);
    expect(p.benefits.some((b) => /Agent Credits included for Customer Chat & Orders/i.test(b))).toBe(
      true,
    );
    expect(p.benefits.join(" ")).not.toMatch(/Agent Spend on Standard|ebay|amazon|not a shop/i);
  });

  it("sells Personal with notification framing", () => {
    const p = payPitchFor({
      accountType: "user",
      lane: "standard",
      readinessSkuId: "on_when_needed",
    });
    expect(p.benefits.some((b) => /Notifications:\s*Never/i.test(b))).toBe(true);
    expect(p.benefits.some((b) => /£12\.50/i.test(b))).toBe(true);
    expect(p.benefits.some((b) => /Daily Actions email/i.test(b))).toBe(true);
    expect(p.benefits.join(" ")).not.toMatch(/Catalog|Brand voice|transaction fee/i);
  });

  it("sells Developer publish path without commerce sell", () => {
    const p = payPitchFor({
      accountType: "developer",
      lane: "byok",
      readinessSkuId: "keeps_in_touch",
    });
    expect(p.benefits.some((b) => /module|connector|publish/i.test(b))).toBe(true);
    expect(p.benefits.some((b) => /Notifications:\s*Hourly/i.test(b))).toBe(true);
    expect(p.benefits.join(" ")).not.toMatch(/Stripe Checkout|transaction fee/i);
  });
});

describe("payChangeReadinessOptions", () => {
  it("excludes open_for_business for Standard and BYOK", () => {
    expect(payChangeReadinessOptions("standard").map((o) => o.id)).toEqual([
      "on_when_needed",
      "keeps_in_touch",
      "always_ready",
    ]);
    expect(payChangeReadinessOptions("byok").map((o) => o.id)).not.toContain("open_for_business");
    expect(notificationLabel("on_when_needed")).toBe("Never");
  });
});

describe("clampReadinessForAccount", () => {
  it("forces Business to open_for_business and strips OFB from Personal", () => {
    expect(clampReadinessForAccount("business", "on_when_needed")).toBe("open_for_business");
    expect(clampReadinessForAccount("user", "open_for_business")).toBe("on_when_needed");
    expect(clampReadinessForAccount("developer", "always_ready")).toBe("always_ready");
  });
});
