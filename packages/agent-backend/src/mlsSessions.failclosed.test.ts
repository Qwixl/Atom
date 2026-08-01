import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { MlsGroupSession, serializeKeyPackages } from "@qwixl/mls-session";
import { MlsSessionStore } from "./mlsSessions.js";
import { MlsSessionRecordStore } from "./mlsSessionRecords.js";

describe("MlsSessionStore fail-closed restore (D135 / 5A)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops corrupt group snapshot from records on load", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-mls-failclosed-"));
    dirs.push(dir);
    const identity = await generateAgentKeyPair();
    const filePath = path.join(dir, "mls-sessions.json");
    const records = new MlsSessionRecordStore(filePath);
    const { session, publicPackage, privatePackage } = await MlsGroupSession.createHost({
      identity,
      roomId: "room:bad",
    });
    const good = session.exportSnapshot();
    records.setGroupSession({
      snapshot: {
        ...good,
        groupStateB64: "not-valid-mls-state!!!!",
      },
      packages: serializeKeyPackages({ publicPackage, privatePackage }),
    });
    await records.flush();

    const store = new MlsSessionStore(identity);
    await store.loadFromRecords(records);
    expect(store.hasRoomSession("room:bad")).toBe(false);
    expect(records.listGroupSessions()).toHaveLength(0);
    await records.flush();
  });

  it("restores valid group snapshot and encrypts after loadFromRecords", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-mls-ok-"));
    dirs.push(dir);
    const identity = await generateAgentKeyPair();
    const filePath = path.join(dir, "mls-sessions.json");
    const records = new MlsSessionRecordStore(filePath);
    const live = new MlsSessionStore(identity);
    live.attachRecords(records);
    await live.createRoomHost({ roomId: "room:ok" });
    await records.flush();

    const restored = new MlsSessionStore(identity);
    const records2 = new MlsSessionRecordStore(filePath);
    await restored.loadFromRecords(records2);
    expect(restored.hasRoomSession("room:ok")).toBe(true);
    const wire = await restored.encryptRoom(
      "room:ok",
      new TextEncoder().encode(JSON.stringify({ kind: "message", text: "hi" })),
    );
    expect(wire.byteLength).toBeGreaterThan(0);
    await records2.flush();
  });
});
