import { describe, expect, it } from "vitest";
import {
  effectiveReachabilityMode,
  evaluateInboundReachability,
  hashWakeSeed,
  hourlyWakeMinute,
  isBrainReachable,
  isInHourlyWakeWindow,
  resolveReachabilityConfig,
  secondsUntilHourlyWakeWindow,
} from "./reachability.js";

describe("resolveReachabilityConfig", () => {
  it("defaults to always_on for backward compatibility", () => {
    expect(resolveReachabilityConfig({ env: {} }).mode).toBe("always_on");
  });

  it("prefers session when brain duty-cycle is off and reachability unset", () => {
    expect(
      resolveReachabilityConfig({ env: { ATOM_BRAIN_ALWAYS_ON: "0" } }).mode,
    ).toBe("session");
  });

  it("honours explicit ATOM_REACHABILITY", () => {
    expect(
      resolveReachabilityConfig({ env: { ATOM_REACHABILITY: "sleep" } }).mode,
    ).toBe("sleep");
  });

  it("forces always_on for community host mode", () => {
    const config = resolveReachabilityConfig({
      env: { ATOM_REACHABILITY: "sleep", ATOM_COMMUNITY_HOST: "1" },
      communityHostMode: true,
    });
    expect(config.forceAlwaysOn).toBe(true);
    expect(effectiveReachabilityMode(config)).toBe("always_on");
  });

  it("forces always_on for community-host agent kind", () => {
    expect(
      resolveReachabilityConfig({
        env: { ATOM_AGENT_KIND: "community-host", ATOM_REACHABILITY: "sleep" },
      }).mode,
    ).toBe("always_on");
  });
});

describe("hourly wake window", () => {
  const seed = "https://agent.example.test";

  it("uses stable jitter minute from seed", () => {
    expect(hourlyWakeMinute(seed)).toBe(hashWakeSeed(seed) % 60);
    expect(hourlyWakeMinute(seed)).toBe(hourlyWakeMinute(seed));
  });

  it("is true for five consecutive minutes", () => {
    const wakeMinute = hourlyWakeMinute(seed);
    for (let offset = 0; offset < 5; offset++) {
      const minute = (wakeMinute + offset) % 60;
      const now = new Date(Date.UTC(2026, 6, 21, 10, minute, 30));
      expect(isInHourlyWakeWindow(now, seed)).toBe(true);
    }
    const outside = new Date(Date.UTC(2026, 6, 21, 10, (wakeMinute + 10) % 60, 0));
    expect(isInHourlyWakeWindow(outside, seed)).toBe(false);
  });

  it("reports retryAfterSec outside the window", () => {
    const wakeMinute = hourlyWakeMinute(seed);
    const outsideMinute = (wakeMinute + 20) % 60;
    const now = new Date(Date.UTC(2026, 6, 21, 8, outsideMinute, 15));
    expect(isInHourlyWakeWindow(now, seed)).toBe(false);
    expect(secondsUntilHourlyWakeWindow(now, seed)).toBeGreaterThan(0);
  });
});

describe("evaluateInboundReachability", () => {
  it("accepts always_on and session", () => {
    expect(
      evaluateInboundReachability({ mode: "always_on", wakeSeed: "x", forceAlwaysOn: false })
        .accept,
    ).toBe(true);
    expect(
      evaluateInboundReachability({ mode: "session", wakeSeed: "x", forceAlwaysOn: false })
        .accept,
    ).toBe(true);
  });

  it("rejects sleep with agent_asleep", () => {
    const verdict = evaluateInboundReachability({
      mode: "sleep",
      wakeSeed: "x",
      forceAlwaysOn: false,
    });
    expect(verdict.accept).toBe(false);
    expect(verdict.error).toBe("agent_asleep");
    expect(verdict.message).toBe("asleep, try later");
  });

  it("rejects hourly_wake outside window", () => {
    const seed = "wake-test";
    const wakeMinute = hourlyWakeMinute(seed);
    const now = new Date(Date.UTC(2026, 0, 1, 12, (wakeMinute + 30) % 60, 0));
    const verdict = evaluateInboundReachability(
      { mode: "hourly_wake", wakeSeed: seed, forceAlwaysOn: false },
      now,
    );
    expect(verdict.accept).toBe(false);
    expect(verdict.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("isBrainReachable", () => {
  it("matches hourly wake window for hourly_wake mode", () => {
    const seed = "brain-seed";
    const wakeMinute = hourlyWakeMinute(seed);
    const inWindow = new Date(Date.UTC(2026, 3, 1, 4, wakeMinute, 0));
    const outWindow = new Date(Date.UTC(2026, 3, 1, 4, (wakeMinute + 10) % 60, 0));
    const config = { mode: "hourly_wake" as const, wakeSeed: seed, forceAlwaysOn: false };
    expect(isBrainReachable(config, inWindow)).toBe(true);
    expect(isBrainReachable(config, outWindow)).toBe(false);
  });

  it("is false for session and sleep", () => {
    const config = (mode: "session" | "sleep") => ({
      mode,
      wakeSeed: "x",
      forceAlwaysOn: false,
    });
    expect(isBrainReachable(config("session"))).toBe(false);
    expect(isBrainReachable(config("sleep"))).toBe(false);
  });
});
