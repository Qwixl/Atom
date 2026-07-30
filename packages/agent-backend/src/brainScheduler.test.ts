import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRESENTATION_BOARD_CATEGORY,
  PRESENTATION_BOARD_STATE_LABEL,
  type PersistedSurface,
} from "@qwixl/owner-store";
import { ConnectorVault } from "./connectorVault.js";
import { BrainScheduler } from "./brainScheduler.js";
import type { StandingIntent } from "./standingIntents.js";

describe("BrainScheduler", () => {
  let dir: string | null = null;

  afterEach(async () => {
    if (dir) {
      // Allow queued vault persists to finish before removing the temp dir (Windows locks).
      await new Promise((r) => setTimeout(r, 50));
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      dir = null;
    }
  });

  async function vaultWithIntents(intents: StandingIntent[]): Promise<ConnectorVault> {
    dir = await mkdtemp(path.join(tmpdir(), "atom-brain-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "connector-vault.enc"),
    );
    await vault.load();
    await vault.setStandingIntents(intents);
    return vault;
  }

  it("fires due interval intent and queues notification", async () => {
    const intent: StandingIntent = {
      id: "w1",
      kind: "watch",
      enabled: true,
      title: "News watch",
      trigger: { type: "interval", everyMinutes: 15 },
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    };
    const vault = await vaultWithIntents([intent]);
    let clock = new Date("2026-07-10T12:00:00.000Z");
    const scheduler = new BrainScheduler({
      vault,
      alwaysOn: true,
      now: () => clock,
    });

    const first = await scheduler.tick();
    expect(first.fired).toHaveLength(1);
    expect(first.notifications).toHaveLength(1);
    expect(vault.getBrainPendingNotifications()).toHaveLength(1);

    const stored = vault.getStandingIntents()[0] as StandingIntent;
    expect(stored.lastFiredAt).toBe("2026-07-10T12:00:00.000Z");

    clock = new Date("2026-07-10T12:10:00.000Z");
    const second = await scheduler.tick();
    expect(second.fired).toHaveLength(0);

    clock = new Date("2026-07-10T12:15:00.000Z");
    const third = await scheduler.tick();
    expect(third.fired).toHaveLength(1);
    await vault.flush();
  });

  it("skips firing when alwaysOn is false", async () => {
    const intent: StandingIntent = {
      id: "w1",
      kind: "watch",
      enabled: true,
      title: "News watch",
      trigger: { type: "interval", everyMinutes: 1 },
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    };
    const vault = await vaultWithIntents([intent]);
    const scheduler = new BrainScheduler({
      vault,
      alwaysOn: false,
      now: () => new Date("2026-07-10T12:00:00.000Z"),
    });
    const result = await scheduler.tick();
    expect(result.fired).toHaveLength(0);
    expect(vault.getBrainPendingNotifications()).toHaveLength(0);
    await vault.flush();
  });

  function boardSurface(): PersistedSurface {
    return {
      surfaceId: "board-tile",
      composition: {
        version: 1,
        surfaceId: "board-tile",
        root: { id: "title", component: "core/text", props: { text: "Before" } },
      },
      bindings: [
        {
          nodeId: "title",
          prop: "text",
          source: { connector: "weather", tool: "current" },
          select: "/summary",
        },
      ],
      refresh: {
        trigger: { type: "interval", everyMinutes: 15 },
        staleAfterSeconds: 900,
      },
      placement: { screen: 0 },
      ownerOverrides: [],
      lastRefreshedAt: {},
      createdAt: 1_000,
      updatedAt: 1_000,
    };
  }

  async function vaultWithBoard(surface: PersistedSurface, dismissed = [{ surfaceId: "gone", at: 99 }]) {
    dir = await mkdtemp(path.join(tmpdir(), "atom-brain-board-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "connector-vault.enc"),
    );
    await vault.load();
    await vault.setOwnerRecords([
      {
        id: "board-1",
        category: PRESENTATION_BOARD_CATEGORY,
        label: PRESENTATION_BOARD_STATE_LABEL,
        value: {
          schemaVersion: 2,
          surfaces: [surface],
          dismissed,
          regions: [],
          updatedAt: 1_000,
        },
        guarded: false,
        updated: 1_000,
      },
    ]);
    return vault;
  }

  it("does not refresh the board when killSwitch is true", async () => {
    const executor = vi.fn(async () => ({ summary: "After" }));
    const vault = await vaultWithBoard(boardSurface());
    const scheduler = new BrainScheduler({
      vault,
      alwaysOn: true,
      killSwitch: true,
      boardExecutor: executor,
      listEntitledConnectors: async () => ["weather"],
      now: () => new Date("2026-07-10T12:00:00.000Z"),
    });
    const result = await scheduler.tick();
    expect(result.boardRefreshedSurfaceIds).toEqual([]);
    expect(executor).not.toHaveBeenCalled();
    const records = vault.getOwnerRecords<{ value: { surfaces: PersistedSurface[] } }>();
    expect(records[0]?.value.surfaces[0]?.composition.root.props?.text).toBe("Before");
    await vault.flush();
  });

  it("expires board tiles without writing to dismissed", async () => {
    const executor = vi.fn(async () => ({ summary: "After" }));
    const dismissed = [{ surfaceId: "owner-dismissed", at: 50 }];
    const vault = await vaultWithBoard(
      {
        ...boardSurface(),
        refresh: {
          trigger: { type: "interval", everyMinutes: 15 },
          staleAfterSeconds: 60,
          expiresAfterSeconds: 10,
        },
        createdAt: 1_000,
      },
      dismissed,
    );
    const scheduler = new BrainScheduler({
      vault,
      alwaysOn: true,
      boardExecutor: executor,
      listEntitledConnectors: async () => ["weather"],
      now: () => new Date(12_000),
    });
    const result = await scheduler.tick();
    expect(result.boardExpiredSurfaceIds).toEqual(["board-tile"]);
    expect(executor).not.toHaveBeenCalled();
    const records = vault.getOwnerRecords<{
      value: { surfaces: PersistedSurface[]; dismissed: Array<{ surfaceId: string; at: number }> };
    }>();
    expect(records[0]?.value.surfaces).toEqual([]);
    expect(records[0]?.value.dismissed).toEqual(dismissed);
    await vault.flush();
  });

  it("refreshes due board surfaces on tick", async () => {
    const executor = vi.fn(async () => ({ summary: "After" }));
    const vault = await vaultWithBoard(boardSurface());
    const scheduler = new BrainScheduler({
      vault,
      alwaysOn: true,
      boardExecutor: executor,
      listEntitledConnectors: async () => ["weather"],
      now: () => new Date("2026-07-10T12:00:00.000Z"),
    });
    const result = await scheduler.tick();
    expect(result.boardRefreshedSurfaceIds).toEqual(["board-tile"]);
    expect(executor).toHaveBeenCalledTimes(1);
    const records = vault.getOwnerRecords<{ value: { surfaces: PersistedSurface[] } }>();
    expect(records[0]?.value.surfaces[0]?.composition.root.props?.text).toBe("After");
    await vault.flush();
  });

  it("does not write owner store when no board surfaces are due", async () => {
    const executor = vi.fn(async () => ({ summary: "After" }));
    const lastAttempt = Date.parse("2026-07-10T12:00:00.000Z");
    const vault = await vaultWithBoard({
      ...boardSurface(),
      lastAttemptedAt: { "title:text": lastAttempt },
      lastRefreshedAt: { "title:text": lastAttempt },
    });
    const setSpy = vi.spyOn(vault, "setOwnerRecords");
    const scheduler = new BrainScheduler({
      vault,
      alwaysOn: true,
      boardExecutor: executor,
      listEntitledConnectors: async () => ["weather"],
      now: () => new Date("2026-07-10T12:05:00.000Z"),
    });
    await scheduler.tick();
    expect(executor).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    await vault.flush();
  });
});
