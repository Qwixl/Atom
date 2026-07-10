import { describe, expect, it } from "vitest";

/** Mirror of control-plane resolveHostedBrainAlwaysOn — keep behavior aligned. */
function resolveHostedBrainAlwaysOn(
  env: Record<string, string | undefined>,
  opts?: { subscribed?: boolean },
): boolean {
  const betaFree = env.ATOM_BETA_FREE !== "0" && env.ATOM_BETA_FREE !== "false";
  if (betaFree) return true;
  return opts?.subscribed === true;
}

describe("resolveHostedBrainAlwaysOn (BK-45 policy)", () => {
  it("defaults to always-on during beta", () => {
    expect(resolveHostedBrainAlwaysOn({})).toBe(true);
  });

  it("requires subscription when beta is off", () => {
    expect(resolveHostedBrainAlwaysOn({ ATOM_BETA_FREE: "0" })).toBe(false);
    expect(resolveHostedBrainAlwaysOn({ ATOM_BETA_FREE: "0" }, { subscribed: true })).toBe(true);
  });
});
