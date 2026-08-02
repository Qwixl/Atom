import { describe, expect, it } from "vitest";

/** Mirror of control-plane resolveHostedBrainAlwaysOn — keep behavior aligned. */
function resolveHostedBrainAlwaysOn(
  _env: Record<string, string | undefined>,
  opts?: { subscribed?: boolean },
): boolean {
  return opts?.subscribed === true;
}

describe("resolveHostedBrainAlwaysOn (BK-45 policy)", () => {
  it("requires subscription", () => {
    expect(resolveHostedBrainAlwaysOn({})).toBe(false);
    expect(resolveHostedBrainAlwaysOn({}, { subscribed: true })).toBe(true);
  });
});
