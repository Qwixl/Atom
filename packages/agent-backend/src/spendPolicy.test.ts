import { describe, expect, it } from "vitest";
import { spendPolicyAllows, defaultSpendPolicy } from "./spendPolicy.js";

describe("spendPolicy", () => {
  it("allows in-budget commerce under threshold without chrome", () => {
    const policy = defaultSpendPolicy("ws-1");
    const verdict = spendPolicyAllows(policy, "commerce", 1000, 0);
    expect(verdict.allowed).toBe(true);
    expect(verdict.requiresChrome).toBe(false);
  });

  it("requires chrome above threshold", () => {
    const policy = { ...defaultSpendPolicy("ws-1"), chromeApprovalThresholdMinor: 500 };
    const verdict = spendPolicyAllows(policy, "commerce", 600, 0);
    expect(verdict.allowed).toBe(true);
    expect(verdict.requiresChrome).toBe(true);
  });
});
