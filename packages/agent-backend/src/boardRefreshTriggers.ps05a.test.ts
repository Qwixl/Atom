import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateConnectorCache,
  setConnectorCacheInvalidateListener,
} from "./connectorInvoke.js";
import { BrainScheduler } from "./brainScheduler.js";
import { ConnectorVault } from "./connectorVault.js";
import {
  PRESENTATION_BOARD_CATEGORY,
  PRESENTATION_BOARD_STATE_LABEL,
  type PersistedSurface,
} from "@qwixl/owner-store";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("invalidateConnectorCache → board connector-change (PS-05a)", () => {
  let dir: string | null = null;

  afterEach(async () => {
    setConnectorCacheInvalidateListener(undefined);
    if (dir) {
      await new Promise((r) => setTimeout(r, 50));
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      dir = null;
    }
  });

  it("notifies the registered listener with the connector id", () => {
    const listener = vi.fn();
    setConnectorCacheInvalidateListener(listener);
    invalidateConnectorCache("webcal");
    expect(listener).toHaveBeenCalledWith("webcal");
  });

  it("listener noteConnectorChange refreshes matching board surfaces on tick", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-inv-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "connector-vault.enc"),
    );
    await vault.load();
    const surface: PersistedSurface = {
      surfaceId: "cal-tile",
      composition: {
        version: 1,
        surfaceId: "cal-tile",
        root: { id: "t", component: "core/text", props: { text: "Before" } },
      },
      bindings: [
        {
          nodeId: "t",
          prop: "text",
          source: { connector: "webcal", tool: "events" },
          select: "/summary",
        },
      ],
      refresh: {
        trigger: { type: "connector-change", connector: "webcal" },
        staleAfterSeconds: 900,
      },
      placement: { screen: 0 },
      ownerOverrides: [],
      lastRefreshedAt: {},
      createdAt: 1_000,
      updatedAt: 1_000,
    };
    await vault.setOwnerRecords([
      {
        id: "board-1",
        category: PRESENTATION_BOARD_CATEGORY,
        label: PRESENTATION_BOARD_STATE_LABEL,
        value: {
          schemaVersion: 2,
          surfaces: [surface],
          dismissed: [],
          regions: [],
          updatedAt: 1_000,
        },
        guarded: false,
        updated: 1_000,
      },
    ]);
    const executor = vi.fn(async () => ({ summary: "After" }));
    const scheduler = new BrainScheduler({
      vault,
      alwaysOn: true,
      boardExecutor: executor,
      listEntitledConnectors: async () => ["webcal"],
      now: () => new Date("2026-07-10T12:00:00.000Z"),
    });
    setConnectorCacheInvalidateListener((connectorId) => {
      scheduler.noteConnectorChange(connectorId);
    });
    invalidateConnectorCache("webcal");
    const result = await scheduler.tick();
    expect(result.boardRefreshedSurfaceIds).toEqual(["cal-tile"]);
    expect(executor).toHaveBeenCalledTimes(1);
    await vault.flush();
  });
});
