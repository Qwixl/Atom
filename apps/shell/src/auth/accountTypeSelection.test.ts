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

  it("rejects personal + business", () => {
    expect(() =>
      AccountTypeSelection.fromFlags({
        personal: true,
        developer: false,
        business: true,
      }),
    ).toThrow(/one account type at a time/);
  });

  it("rejects developer + business", () => {
    expect(() =>
      AccountTypeSelection.fromFlags({
        personal: false,
        developer: true,
        business: true,
      }),
    ).toThrow(/one account type at a time/);
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
    ).toThrow(/one account type at a time/);
  });

  it("rejects empty selection", () => {
    expect(() =>
      AccountTypeSelection.fromFlags({
        personal: false,
        developer: false,
        business: false,
      }),
    ).toThrow(/Select one/);
  });

  it("round-trips via fromAccountTypes", () => {
    const selection = AccountTypeSelection.fromAccountTypes(["developer"]);
    expect(selection.persona).toBe("developer");
    expect(selection.business).toBe(false);
    expect(selection.toAccountTypes()).toEqual(["developer"]);
  });
});
