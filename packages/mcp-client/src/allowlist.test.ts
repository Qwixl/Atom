import { describe, expect, it } from "vitest";
import { isMcpToolAllowed } from "./allowlist.js";

describe("isMcpToolAllowed", () => {
  it("allows any tool when allowlist is empty", () => {
    expect(isMcpToolAllowed("search", [])).toBe(true);
  });

  it("enforces allowlist when populated", () => {
    expect(isMcpToolAllowed("search", ["search", "fetch"])).toBe(true);
    expect(isMcpToolAllowed("delete", ["search"])).toBe(false);
  });

  it("rejects blank tool names", () => {
    expect(isMcpToolAllowed("  ", ["search"])).toBe(false);
  });
});
