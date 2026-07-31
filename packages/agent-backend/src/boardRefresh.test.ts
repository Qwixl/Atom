import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { PersistedSurface } from "@qwixl/owner-store";
import { refreshDueSurfaces, type BoardDegradeRequest } from "./boardRefresh.js";

function testSurface(overrides: Partial<PersistedSurface> = {}): PersistedSurface {
  return {
    surfaceId: "tile-1",
    composition: {
      version: 1,
      surfaceId: "tile-1",
      root: { id: "n1", component: "core/text", props: { text: "Hello" } },
    },
    bindings: [
      {
        nodeId: "n1",
        prop: "text",
        source: { connector: "weather", tool: "current" },
        select: "/summary",
        format: "text",
      },
    ],
    refresh: {
      trigger: { type: "interval", everyMinutes: 1 },
      staleAfterSeconds: 900,
    },
    placement: { screen: 0 },
    ownerOverrides: [],
    lastRefreshedAt: {},
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("boardRefresh structural guarantee", () => {
  it("does not import any model client module", () => {
    const src = readFileSync(fileURLToPath(new URL("./boardRefresh.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/@qwixl\/agent-llm/);
    expect(src).not.toMatch(/brainTurn/);
    expect(src).not.toMatch(/llmRunner/);
    expect(src).not.toMatch(/runLlm/);
  });
});

describe("refreshDueSurfaces", () => {
  it("board refresh resolves bindings without any model call (D123 invariant 6)", async () => {
    const modelSpy = vi.fn();
    const executor = vi.fn(async () => ({ summary: "Sunny" }));
    const now = 1_700_000_000_000;
    const result = await refreshDueSurfaces({
      surfaces: [testSurface()],
      executor,
      entitledConnectors: ["weather"],
      now,
    });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(modelSpy).not.toHaveBeenCalled();
    expect(result.surfaces[0]?.composition.root.props?.text).toBe("Sunny");
    expect(result.surfaces[0]?.lastRefreshedAt["n1:text"]).toBe(now);
  });

  it("preserves the previous value and records lastError when a binding fails", async () => {
    const executor = vi.fn(async () => {
      throw new Error("upstream timeout");
    });
    const surface = testSurface({
      composition: {
        version: 1,
        surfaceId: "tile-1",
        root: { id: "n1", component: "core/text", props: { text: "Kept" } },
      },
    });
    const result = await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather"],
      now: 2_000,
    });
    const next = result.surfaces[0]!;
    expect(next.composition.root.props?.text).toBe("Kept");
    expect(next.lastError).toEqual({ at: 2_000, message: "upstream timeout" });
    expect(next.failureCounts).toEqual({ "n1:text": 1 });
  });

  it("marks the surface degraded exactly once after three consecutive failures", async () => {
    const executor = vi.fn(async () => {
      throw new Error("still failing");
    });
    let surface = testSurface();
    const degradeRequests: BoardDegradeRequest[] = [];
    const minute = 60_000;
    const base = 2_000_000;

    for (let step = 0; step < 4; step += 1) {
      const result = await refreshDueSurfaces({
        surfaces: [surface],
        executor,
        entitledConnectors: ["weather"],
        now: base + step * (minute + 1_000),
      });
      surface = result.surfaces[0]!;
      degradeRequests.push(...result.degradeRequests);
    }

    expect(surface.failureCounts).toEqual({ "n1:text": 3 });
    expect(surface.lastError?.message).toBe("still failing");
    expect(degradeRequests).toHaveLength(1);
    expect(degradeRequests[0]?.surfaceId).toBe("tile-1");
  });

  it("clears failure count after success so three more failures are required to degrade again", async () => {
    let surface = testSurface();
    const failing = vi.fn(async () => {
      throw new Error("fail");
    });
    const succeeding = vi.fn(async () => ({ summary: "Clear skies" }));
    const minute = 60_000;
    const base = 1_000_000;

    const failTwice = await refreshDueSurfaces({
      surfaces: [surface],
      executor: failing,
      entitledConnectors: ["weather"],
      now: base,
    });
    surface = failTwice.surfaces[0]!;
    const failTwiceAgain = await refreshDueSurfaces({
      surfaces: [surface],
      executor: failing,
      entitledConnectors: ["weather"],
      now: base + minute + 1_000,
    });
    surface = failTwiceAgain.surfaces[0]!;
    expect(surface.failureCounts).toEqual({ "n1:text": 2 });

    const recovered = await refreshDueSurfaces({
      surfaces: [surface],
      executor: succeeding,
      entitledConnectors: ["weather"],
      now: base + 2 * (minute + 1_000),
    });
    surface = recovered.surfaces[0]!;
    expect(surface.failureCounts).toBeUndefined();
    expect(surface.lastError).toBeUndefined();

    const degradeIds: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      const result = await refreshDueSurfaces({
        surfaces: [surface],
        executor: failing,
        entitledConnectors: ["weather"],
        now: base + (3 + step) * (minute + 1_000),
      });
      surface = result.surfaces[0]!;
      degradeIds.push(...result.degradeRequests.map((request) => request.surfaceId));
    }
    expect(degradeIds).toEqual(["tile-1"]);
    expect(surface.failureCounts).toEqual({ "n1:text": 3 });
  });

  it("removes expired surfaces without touching dismissed state elsewhere", async () => {
    const executor = vi.fn(async () => ({ summary: "ignored" }));
    const result = await refreshDueSurfaces({
      surfaces: [
        testSurface({
          refresh: {
            trigger: { type: "interval", everyMinutes: 15 },
            staleAfterSeconds: 60,
            expiresAfterSeconds: 10,
          },
          createdAt: 1_000,
        }),
      ],
      executor,
      entitledConnectors: ["weather"],
      now: 12_000,
    });
    expect(result.surfaces).toEqual([]);
    expect(result.expiredSurfaceIds).toEqual(["tile-1"]);
    expect(executor).not.toHaveBeenCalled();
  });

  it("treats an unentitled connector as a binding failure without fetching", async () => {
    const executor = vi.fn(async () => ({ summary: "should not run" }));
    const surface = testSurface({
      composition: {
        version: 1,
        surfaceId: "tile-1",
        root: { id: "n1", component: "core/text", props: { text: "Frozen" } },
      },
    });
    const result = await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: [],
      now: 2_000,
    });
    expect(executor).not.toHaveBeenCalled();
    const next = result.surfaces[0]!;
    expect(next.composition.root.props?.text).toBe("Frozen");
    expect(next.lastError?.message).toContain("not entitled");
    expect(next.failureCounts).toEqual({ "n1:text": 1 });
  });

  it("does not refresh surfaces that are not yet due", async () => {
    const executor = vi.fn(async () => ({ summary: "Fresh" }));
    const lastAttempt = 1_700_000_000_000;
    const surface = testSurface({
      refresh: {
        trigger: { type: "interval", everyMinutes: 15 },
        staleAfterSeconds: 900,
      },
      lastAttemptedAt: { "n1:text": lastAttempt },
      lastRefreshedAt: { "n1:text": lastAttempt },
    });
    const result = await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather"],
      now: lastAttempt + 5 * 60_000,
    });
    expect(executor).not.toHaveBeenCalled();
    expect(result.refreshedSurfaceIds).toEqual([]);
    expect(result.stateChanged).toBe(false);
    expect(result.surfaces[0]).toEqual(surface);
  });

  it("does not call the executor for a binding at the failure threshold", async () => {
    const executor = vi.fn(async () => {
      throw new Error("still failing");
    });
    const minute = 60_000;
    const base = 6_000_000;
    let surface = testSurface();

    for (let step = 0; step < 3; step += 1) {
      const result = await refreshDueSurfaces({
        surfaces: [surface],
        executor,
        entitledConnectors: ["weather"],
        now: base + step * (minute + 1_000),
      });
      surface = result.surfaces[0]!;
    }
    expect(surface.failureCounts).toEqual({ "n1:text": 3 });
    const callsBefore = executor.mock.calls.length;

    const afterThreshold = await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather"],
      now: base + 3 * (minute + 1_000),
    });
    expect(executor.mock.calls.length).toBe(callsBefore);
    expect(afterThreshold.stateChanged).toBe(false);
    expect(afterThreshold.surfaces[0]).toEqual(surface);
  });

  it("a permanently failing binding does not make the surface due more often than its trigger allows", async () => {
    const executor = vi.fn(async () => {
      throw new Error("permanent failure");
    });
    const base = 5_000_000;
    const intervalMs = 15 * 60_000;
    let surface = testSurface({
      refresh: {
        trigger: { type: "interval", everyMinutes: 15 },
        staleAfterSeconds: 900,
      },
    });

    const first = await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather"],
      now: base,
    });
    surface = first.surfaces[0]!;
    expect(executor).toHaveBeenCalledTimes(1);
    expect(surface.lastAttemptedAt?.["n1:text"]).toBe(base);
    expect(surface.lastRefreshedAt["n1:text"]).toBeUndefined();

    await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather"],
      now: base + 60_000,
    });
    expect(executor).toHaveBeenCalledTimes(1);

    await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather"],
      now: base + intervalMs,
    });
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("a surface with one degraded binding and one healthy binding respects the healthy binding interval (not every tick)", async () => {
    const executor = vi.fn(async (call) => {
      if (call.connectorId === "weather") throw new Error("weather down");
      return { headline: "Latest" };
    });
    const minute = 60_000;
    const base = 10_000_000;
    const intervalMs = 15 * 60_000;
    let surface = testSurface({
      composition: {
        version: 1,
        surfaceId: "tile-1",
        root: {
          id: "n1",
          component: "core/text",
          props: { text: "Stale", subtitle: "Old" },
        },
      },
      bindings: [
        {
          nodeId: "n1",
          prop: "text",
          source: { connector: "weather", tool: "current" },
          select: "/summary",
          format: "text",
        },
        {
          nodeId: "n1",
          prop: "subtitle",
          source: { connector: "news", tool: "headlines" },
          select: "/headline",
          format: "text",
        },
      ],
      refresh: {
        trigger: { type: "interval", everyMinutes: 15 },
        staleAfterSeconds: 900,
      },
    });

    for (let step = 0; step < 3; step += 1) {
      const result = await refreshDueSurfaces({
        surfaces: [surface],
        executor,
        entitledConnectors: ["weather", "news"],
        now: base + step * (intervalMs + 1_000),
      });
      surface = result.surfaces[0]!;
    }
    expect(surface.failureCounts?.["n1:text"]).toBe(3);
    expect(surface.lastRefreshedAt["n1:subtitle"]).toBeDefined();
    const callsAfterDegrade = executor.mock.calls.length;
    const lastDegradeAt = base + 2 * (intervalMs + 1_000);

    await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather", "news"],
      now: lastDegradeAt + minute,
    });
    expect(executor.mock.calls.length).toBe(callsAfterDegrade);

    const newsLastAttempt = surface.lastAttemptedAt?.["n1:subtitle"] ?? 0;
    await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather", "news"],
      now: newsLastAttempt + intervalMs,
    });
    expect(executor.mock.calls.length).toBe(callsAfterDegrade + 1);
    expect(executor.mock.calls.at(-1)?.[0]?.connectorId).toBe("news");
  });

  it("a surface whose bindings are all at the failure threshold is not due and performs no executor call or write", async () => {
    const executor = vi.fn(async () => {
      throw new Error("still failing");
    });
    const minute = 60_000;
    const base = 11_000_000;
    let surface = testSurface();

    for (let step = 0; step < 3; step += 1) {
      const result = await refreshDueSurfaces({
        surfaces: [surface],
        executor,
        entitledConnectors: ["weather"],
        now: base + step * (minute + 1_000),
      });
      surface = result.surfaces[0]!;
    }
    expect(surface.failureCounts).toEqual({ "n1:text": 3 });
    const callsBefore = executor.mock.calls.length;

    const afterAllDegraded = await refreshDueSurfaces({
      surfaces: [surface],
      executor,
      entitledConnectors: ["weather"],
      now: base + 10 * (minute + 1_000),
    });
    expect(executor.mock.calls.length).toBe(callsBefore);
    expect(afterAllDegraded.stateChanged).toBe(false);
    expect(afterAllDegraded.surfaces[0]).toEqual(surface);
  });

  describe("table format projection", () => {
    function tableSurface(overrides: Partial<PersistedSurface> = {}): PersistedSurface {
      return testSurface({
        composition: {
          version: 1,
          surfaceId: "tile-1",
          root: {
            id: "tbl",
            component: "core/table",
            props: {
              columns: ["When", "What"],
              rows: [["2026-01-01T00:00:00.000Z", "Kept"]],
            },
          },
        },
        bindings: [
          {
            nodeId: "tbl",
            prop: "rows",
            source: { connector: "webcal", tool: "listEvents" },
            select: "/events",
            format: "table",
            columns: ["start", "summary"],
          },
        ],
        ...overrides,
      });
    }

    it("projects an array of objects into rows using columns in declared order", async () => {
      const executor = vi.fn(async () => ({
        events: [
          { start: "2026-07-30T09:00:00.000Z", summary: "Standup" },
          { start: "2026-07-30T14:00:00.000Z", summary: "Review" },
        ],
      }));
      const result = await refreshDueSurfaces({
        surfaces: [tableSurface()],
        executor,
        entitledConnectors: ["webcal"],
        now: 1_700_000_000_000,
      });
      expect(result.surfaces[0]?.composition.root.props?.rows).toEqual([
        ["2026-07-30T09:00:00.000Z", "Standup"],
        ["2026-07-30T14:00:00.000Z", "Review"],
      ]);
    });

    it("uses an empty cell for a missing or null projected field", async () => {
      const executor = vi.fn(async () => ({
        events: [{ start: "2026-07-30T09:00:00.000Z" }, { summary: "No time" }],
      }));
      const result = await refreshDueSurfaces({
        surfaces: [tableSurface()],
        executor,
        entitledConnectors: ["webcal"],
        now: 1_700_000_000_000,
      });
      expect(result.surfaces[0]?.composition.root.props?.rows).toEqual([
        ["2026-07-30T09:00:00.000Z", ""],
        ["", "No time"],
      ]);
    });

    it("stringifies nested object cells instead of dropping them", async () => {
      const nested = { room: "A", floor: 2 };
      const executor = vi.fn(async () => ({
        events: [{ start: "2026-07-30T09:00:00.000Z", summary: "Standup", meta: nested }],
      }));
      const surface = tableSurface({
        bindings: [
          {
            nodeId: "tbl",
            prop: "rows",
            source: { connector: "webcal", tool: "listEvents" },
            select: "/events",
            format: "table",
            columns: ["start", "meta"],
          },
        ],
      });
      const result = await refreshDueSurfaces({
        surfaces: [surface],
        executor,
        entitledConnectors: ["webcal"],
        now: 1_700_000_000_000,
      });
      expect(result.surfaces[0]?.composition.root.props?.rows).toEqual([
        ["2026-07-30T09:00:00.000Z", JSON.stringify(nested)],
      ]);
    });

    it("passes date values through raw without backend reformatting", async () => {
      const isoStart = "2026-07-30T09:00:00.000Z";
      const executor = vi.fn(async () => ({
        events: [{ start: isoStart, summary: "Standup" }],
      }));
      const result = await refreshDueSurfaces({
        surfaces: [tableSurface()],
        executor,
        entitledConnectors: ["webcal"],
        now: 1_700_000_000_000,
      });
      const rows = result.surfaces[0]?.composition.root.props?.rows as string[][];
      expect(rows?.[0]?.[0]).toBe(isoStart);
      expect(rows?.[0]?.[0]).not.toMatch(/Jul|Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
    });

    it("treats a non-array selected value as a binding failure and preserves the previous rows", async () => {
      const executor = vi.fn(async () => ({ events: "not-an-array" }));
      const surface = tableSurface();
      const result = await refreshDueSurfaces({
        surfaces: [surface],
        executor,
        entitledConnectors: ["webcal"],
        now: 2_000,
      });
      const next = result.surfaces[0]!;
      expect(next.composition.root.props?.rows).toEqual([
        ["2026-01-01T00:00:00.000Z", "Kept"],
      ]);
      expect(next.lastError?.message).toContain("must be an array");
      expect(next.failureCounts).toEqual({ "tbl:rows": 1 });
    });

    it("treats an array containing a non-object as a binding failure and preserves the previous rows", async () => {
      const executor = vi.fn(async () => ({
        events: [{ start: "2026-07-30T09:00:00.000Z", summary: "Ok" }, "bad-row"],
      }));
      const surface = tableSurface();
      const result = await refreshDueSurfaces({
        surfaces: [surface],
        executor,
        entitledConnectors: ["webcal"],
        now: 2_000,
      });
      const next = result.surfaces[0]!;
      expect(next.composition.root.props?.rows).toEqual([
        ["2026-01-01T00:00:00.000Z", "Kept"],
      ]);
      expect(next.lastError?.message).toContain("array of objects");
      expect(next.failureCounts).toEqual({ "tbl:rows": 1 });
    });
  });

  it("a never-successful binding still reports never-refreshed for as-of (lastRefreshedAt remains successes-only)", async () => {
    const now = 8_000_000;
    const executor = vi.fn(async () => {
      throw new Error("never succeeds");
    });
    const result = await refreshDueSurfaces({
      surfaces: [testSurface()],
      executor,
      entitledConnectors: ["weather"],
      now,
    });
    const surface = result.surfaces[0]!;
    expect(surface.lastAttemptedAt?.["n1:text"]).toBe(now);
    expect(surface.lastRefreshedAt["n1:text"]).toBeUndefined();
    expect(Object.keys(surface.lastRefreshedAt)).toHaveLength(0);
  });
});
