import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SwarmMemoryStore } from "./swarmMemoryStore.js";

describe("SwarmMemoryStore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  function tempStore(): SwarmMemoryStore {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-swarm-mem-"));
    dirs.push(dir);
    return new SwarmMemoryStore(path.join(dir, "memory.sqlite"));
  }

  it("keeps core immutable while clamping mutable traits", async () => {
    const store = tempStore();
    await store.load();
    try {
      store.setCoreSheet({
        name: "Mira",
        role: "barista",
        reasonForBeing: "Welcome people to the Coffee Shop",
        values: ["kindness"],
        hardBans: ["hate"],
        voice: "warm",
      });
      expect(store.getCoreSheet()?.name).toBe("Mira");
      store.applyMutableUpdate({ mood: "cheerful", traits: { warmth: 0.5 } });
      const once = store.applyMutableUpdate({ traits: { warmth: 1 } });
      expect(once.traits.warmth).toBeLessThanOrEqual(0.5 + 0.1 + 1e-9);
    } finally {
      store.close();
    }
  });

  it("stores and retrieves memories", async () => {
    const store = tempStore();
    await store.load();
    try {
      store.appendMemory({
        id: "m1",
        kind: "observation",
        text: "A visitor asked about oat milk lattes at the Coffee Shop",
        importance: 0.7,
        placeId: "coffee-shop",
      });
      const hits = store.retrieve("latte coffee shop");
      expect(hits.some((h) => h.id === "m1")).toBe(true);
    } finally {
      store.close();
    }
  });
});

