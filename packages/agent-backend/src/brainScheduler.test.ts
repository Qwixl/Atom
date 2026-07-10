import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
});
