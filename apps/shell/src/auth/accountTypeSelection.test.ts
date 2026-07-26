import { describe, expect, it } from "vitest";
import { AccountTypeSelection } from "./accountTypeSelection.js";

describe("AccountTypeSelection", () => {
  it("defaults personal-only via fromFlags", () => {
    const selection = AccountTypeSelection.fromFlags({
      personal: true,
      developer: false,
      business: false,
    });
    expect(selection.primaryAccountType()).toBe("user");
    expect(selection.toAccountTypes()).toEqual(["user"]);
    expect(selection.wantsBusinessWorkspace()).toBe(false);
  });

  it("allows personal + business", () => {
    const selection = AccountTypeSelection.fromFlags({
      personal: true,
      developer: false,
      business: true,
    });
    expect(selection.primaryAccountType()).toBe("user");
    expect(selection.toAccountTypes()).toEqual(["user", "business"]);
    expect(selection.wantsBusinessWorkspace()).toBe(true);
  });

  it("allows developer + business", () => {
    const selection = AccountTypeSelection.fromFlags({
      personal: false,
      developer: true,
      business: true,
    });
    expect(selection.primaryAccountType()).toBe("developer");
    expect(selection.toAccountTypes()).toEqual(["developer", "business"]);
    expect(selection.wantsDeveloperWorkspace()).toBe(true);
  });

  it("allows business only", () => {
    const selection = AccountTypeSelection.fromFlags({
      personal: false,
      developer: false,
      business: true,
    });
    expect(selection.primaryAccountType()).toBe("business");
    expect(selection.toAccountTypes()).toEqual(["business"]);
  });

  it("rejects personal and developer together", () => {
    expect(() =>
      AccountTypeSelection.fromFlags({
        personal: true,
        developer: true,
        business: false,
      }),
    ).toThrow(/Personal or Developer/);
  });

  it("rejects empty selection", () => {
    expect(() =>
      AccountTypeSelection.fromFlags({
        personal: false,
        developer: false,
        business: false,
      }),
    ).toThrow(/at least one/);
  });

  it("round-trips via fromAccountTypes", () => {
    const selection = AccountTypeSelection.fromAccountTypes(["developer", "business"]);
    expect(selection.persona).toBe("developer");
    expect(selection.business).toBe(true);
    expect(selection.toAccountTypes()).toEqual(["developer", "business"]);
  });
});
