import { describe, expect, it } from "vitest";
import { isHostedBusinessCommerceEligible } from "./commerceEligibility.js";

describe("commerceEligibility (D139)", () => {
  it("rejects env businessMode alone", () => {
    expect(
      isHostedBusinessCommerceEligible({
        ATOM_BUSINESS_MODE: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it("accepts hosted Business entitlement triad", () => {
    expect(
      isHostedBusinessCommerceEligible({
        ATOM_COMMERCE_ELIGIBLE: "1",
        ATOM_WORKSPACE_KIND: "business",
        ATOM_HOSTED: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
