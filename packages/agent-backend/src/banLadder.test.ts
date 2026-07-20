import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BanLadderStore, nextRung } from "./banLadder.js";

describe("BanLadderStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("escalates rungs and supports life ban", async () => {
    expect(nextRung(0)).toBe(1);
    expect(nextRung(3)).toBe(4);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-ban-"));
    dirs.push(dir);
    const store = new BanLadderStore(path.join(dir, "bans.sqlite"));
    await store.load();
    try {
      const first = store.applyBan({
        subjectKey: "account:alice",
        reason: "harassment",
        evidenceRef: "ev-1",
      });
      expect(first.rung).toBe(1);
      expect(first.endsAt).toBeTruthy();
      const second = store.applyBan({
        subjectKey: "account:alice",
        reason: "repeat",
        evidenceRef: "ev-2",
      });
      expect(second.rung).toBe(2);
      const life = store.applyBan({
        subjectKey: "account:bob",
        reason: "severe",
        evidenceRef: "ev-3",
        forceRung: 4,
      });
      expect(life.endsAt).toBeNull();
      expect(store.getActiveBan("account:bob")?.rung).toBe(4);
    } finally {
      store.close();
    }
  });
});
