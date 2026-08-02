import { describe, expect, it } from "vitest";
import { authSteps, stepLabel } from "./authSteps.js";

describe("authSteps", () => {
  it("includes hosting for personal/developer register", () => {
    expect(authSteps("register")).toEqual([
      "account-type",
      "hosting",
      "credentials",
      "profile",
      "provisioning",
    ]);
  });

  it("skips hosting for Business (fixed Atom-hosted Standard)", () => {
    expect(authSteps("register", { skipHosting: true })).toEqual([
      "account-type",
      "credentials",
      "profile",
      "provisioning",
    ]);
  });

  it("adds Pay for hosted paid lanes after verify", () => {
    expect(
      authSteps("register", {
        skipHosting: true,
        supabaseHostedRegister: true,
        needsPay: true,
      }),
    ).toEqual([
      "account-type",
      "credentials",
      "profile",
      "confirm-email",
      "pay",
      "provisioning",
    ]);
  });

  it("omits Pay when needsPay is false (self-host)", () => {
    expect(
      authSteps("register", {
        supabaseHostedRegister: false,
        needsPay: false,
      }),
    ).not.toContain("pay");
  });

  it("still adds confirm-email when supabase hosted register", () => {
    expect(authSteps("register", { skipHosting: true, supabaseHostedRegister: true })).toEqual([
      "account-type",
      "credentials",
      "profile",
      "confirm-email",
      "provisioning",
    ]);
  });

  it("labels pay as Pay", () => {
    expect(stepLabel("pay")).toBe("Pay");
  });
});
