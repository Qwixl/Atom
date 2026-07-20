import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SwarmMemoryStore } from "./swarmMemoryStore.js";
import { runSwarmPlanPass, runSwarmReflectPass } from "./swarmReflect.js";

describe("swarmReflect", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("writes reflection and plan memories", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-reflect-"));
    dirs.push(dir);
    const memory = new SwarmMemoryStore(path.join(dir, "m.sqlite"));
    await memory.load();
    try {
      memory.appendMemory({
        id: "o1",
        kind: "observation",
        text: "Welcomed a friend at the Coffee Shop",
        importance: 0.8,
        placeId: "coffee-shop",
      });
      const reflect = runSwarmReflectPass(memory, "coffee shop friend");
      expect(reflect?.retrievedCount).toBeGreaterThan(0);
      const planId = runSwarmPlanPass(memory, "coffee-shop", "Stay at the bar until noon");
      expect(planId.startsWith("plan-")).toBe(true);
      expect(memory.retrieve("reflection").length).toBeGreaterThan(0);
    } finally {
      memory.close();
    }
  });
});
