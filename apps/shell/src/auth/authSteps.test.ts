import { describe, expect, it } from "vitest";
import { authSteps } from "./authSteps.js";

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

  it("still adds confirm-email when supabase hosted register", () => {
    expect(authSteps("register", { skipHosting: true, supabaseHostedRegister: true })).toEqual([
      "account-type",
      "credentials",
      "profile",
      "confirm-email",
      "provisioning",
    ]);
  });
});
