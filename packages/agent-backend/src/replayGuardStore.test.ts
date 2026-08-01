import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateAgentKeyPair,
  ReplayGuard,
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
} from "@qwixl/protocol";
import { ReplayGuardStore } from "./replayGuardStore.js";

describe("ReplayGuardStore", () => {
  let dir: string;
  let filePath: string;
  let identity: AgentKeyPair;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-replay-"));
    filePath = path.join(dir, "replay-guard.json");
    identity = await generateAgentKeyPair();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function object(text: string) {
    return signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text },
        governance: { purpose: "comms:message", ttlSeconds: 3600 },
      },
      identity,
    );
  }

  it("rejects a replay that arrives after a restart", async () => {
    const first = new ReplayGuardStore(new ReplayGuard(), filePath);
    await first.load();
    const obj = await object("once");
    await verifyDataObject(obj, { replay: first.guard });
    await first.flush();

    // A fresh process: new guard, same data directory.
    const second = new ReplayGuardStore(new ReplayGuard(), filePath);
    await second.load();
    await expect(verifyDataObject(obj, { replay: second.guard })).rejects.toThrow(/replay/);
  });

  it("still admits an object it has never seen after a restart", async () => {
    const first = new ReplayGuardStore(new ReplayGuard(), filePath);
    await first.load();
    await verifyDataObject(await object("seen"), { replay: first.guard });
    await first.flush();

    const second = new ReplayGuardStore(new ReplayGuard(), filePath);
    await second.load();
    const fresh = await object("unseen");
    await expect(verifyDataObject(fresh, { replay: second.guard })).resolves.toMatchObject({
      id: fresh.id,
    });
  });

  it("starts clean when no snapshot exists", async () => {
    const store = new ReplayGuardStore(new ReplayGuard(), filePath);
    await store.load();
    expect(store.guard.size).toBe(0);
  });

  it("boots rather than throwing when the snapshot is unreadable", async () => {
    fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 1, snapshot: { version: 99 } }));
    const store = new ReplayGuardStore(new ReplayGuard(), filePath);
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.guard.size).toBe(0);
  });

  it("writes nothing when it has admitted nothing", async () => {
    const store = new ReplayGuardStore(new ReplayGuard(), filePath);
    await store.load();
    store.start(10);
    await store.flush();
    store.stop();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("does not rewrite an unchanged snapshot", async () => {
    const store = new ReplayGuardStore(new ReplayGuard(), filePath);
    await store.load();
    await verifyDataObject(await object("one"), { replay: store.guard });
    await store.flush();
    const firstWrite = fs.statSync(filePath).mtimeMs;

    await store.flush();
    expect(fs.statSync(filePath).mtimeMs).toBe(firstWrite);

    await verifyDataObject(await object("two"), { replay: store.guard });
    await store.flush();
    expect(fs.statSync(filePath).mtimeMs).not.toBe(firstWrite);
  });
});
