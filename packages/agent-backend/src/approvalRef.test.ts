import { describe, expect, it } from "vitest";
import { allowDevBypassApproval, isValidApprovalRef, requireApprovalRef } from "./approvalRef.js";

describe("approvalRef", () => {
  it("accepts passkey refs", () => {
    expect(isValidApprovalRef("passkey:action-1:deadbeef")).toBe(true);
    expect(requireApprovalRef("passkey:action-1:deadbeef")).toBe("passkey:action-1:deadbeef");
  });

  it("rejects missing refs", () => {
    expect(isValidApprovalRef(undefined)).toBe(false);
    expect(() => requireApprovalRef(undefined)).toThrow(/approvalRef required/);
  });

  it("allows dev bypass only when configured for non-production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    expect(allowDevBypassApproval()).toBe(true);
    expect(isValidApprovalRef("dev-bypass:abc", { allowDevBypass: true })).toBe(true);
    process.env.NODE_ENV = "production";
    expect(allowDevBypassApproval()).toBe(false);
    expect(isValidApprovalRef("dev-bypass:abc", { allowDevBypass: false })).toBe(false);
    process.env.NODE_ENV = prev;
  });
});
