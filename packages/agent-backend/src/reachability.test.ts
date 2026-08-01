import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import {
  createInboundReachabilityMiddleware,
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

  it("accepts hourly_wake inside the wake window", () => {
    const seed = "wake-accept";
    const wakeMinute = hourlyWakeMinute(seed);
    const now = new Date(Date.UTC(2026, 0, 1, 12, wakeMinute, 10));
    const verdict = evaluateInboundReachability(
      { mode: "hourly_wake", wakeSeed: seed, forceAlwaysOn: false },
      now,
    );
    expect(verdict.accept).toBe(true);
  });
});

describe("createInboundReachabilityMiddleware", () => {
  function runMiddleware(opts: {
    mode: "sleep" | "hourly_wake" | "always_on";
    body: string;
    now: Date;
    wakeSeed?: string;
  }): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    enqueued: Array<{ blob: Buffer; fromDid?: string }>;
  }> {
    const enqueued: Array<{ blob: Buffer; fromDid?: string }> = [];
    const middleware = createInboundReachabilityMiddleware({
      config: {
        mode: opts.mode,
        wakeSeed: opts.wakeSeed ?? "mw-seed",
        forceAlwaysOn: false,
      },
      now: () => opts.now,
      enqueue: (input) => {
        enqueued.push(input);
      },
    });

    const req = Readable.from([Buffer.from(opts.body)]) as IncomingMessage;
    req.method = "POST";

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const headers: Record<string, string> = {};
      const res = {
        statusCode: 200,
        setHeader(name: string, value: string) {
          headers[name.toLowerCase()] = value;
        },
        end(payload?: string | Buffer) {
          if (payload) chunks.push(typeof payload === "string" ? Buffer.from(payload) : payload);
          resolve({
            statusCode: res.statusCode,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
            enqueued,
          });
        },
      } as unknown as ServerResponse & { statusCode: number };

      middleware(req, res, (err?: unknown) => {
        if (err) reject(err);
        else {
          resolve({
            statusCode: res.statusCode,
            headers,
            body: "",
            enqueued,
          });
        }
      });
    });
  }

  it("returns 503 agent_asleep and queues body when sleep", async () => {
    const result = await runMiddleware({
      mode: "sleep",
      body: JSON.stringify({ jsonrpc: "2.0", method: "message/send", params: {} }),
      now: new Date("2026-07-21T10:00:00.000Z"),
    });
    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toMatchObject({
      error: "agent_asleep",
      message: "asleep, try later",
    });
    expect(result.enqueued).toHaveLength(1);
    expect(result.enqueued[0]?.blob.toString("utf8")).toContain("message/send");
  });

  it("returns 503 with Retry-After outside hourly_wake window", async () => {
    const seed = "mw-hourly";
    const wakeMinute = hourlyWakeMinute(seed);
    const now = new Date(Date.UTC(2026, 0, 1, 12, (wakeMinute + 30) % 60, 0));
    const result = await runMiddleware({
      mode: "hourly_wake",
      wakeSeed: seed,
      body: "{}",
      now,
    });
    expect(result.statusCode).toBe(503);
    expect(result.headers["retry-after"]).toBeTruthy();
    expect(JSON.parse(result.body).retryAfterSec).toBeGreaterThan(0);
    expect(result.enqueued).toHaveLength(1);
  });

  it("passes through when hourly_wake is inside the window", async () => {
    const seed = "mw-hourly-in";
    const wakeMinute = hourlyWakeMinute(seed);
    const now = new Date(Date.UTC(2026, 0, 1, 12, wakeMinute, 5));
    const result = await runMiddleware({
      mode: "hourly_wake",
      wakeSeed: seed,
      body: "should-not-queue",
      now,
    });
    expect(result.statusCode).toBe(200);
    expect(result.enqueued).toHaveLength(0);
    expect(result.body).toBe("");
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
