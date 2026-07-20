import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SwarmMemoryStore } from "./swarmMemoryStore.js";
import {
  applySwarmMemoryRemember,
  buildSwarmPromptContext,
  parseSwarmMemoryRememberArgs,
} from "./swarmTurnContext.js";
import { clearSwarmCommunityCache } from "./swarmCommunity.js";

describe("swarmTurnContext", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
    clearSwarmCommunityCache();
  });

  async function tempMemory(): Promise<SwarmMemoryStore> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-turn-"));
    dirs.push(dir);
    const store = new SwarmMemoryStore(path.join(dir, "m.sqlite"));
    await store.load();
    store.setCoreSheet({
      name: "Mira",
      role: "Barista",
      reasonForBeing: "Welcome people",
      values: ["hospitality"],
      hardBans: ["hate"],
      voice: "warm",
    });
    return store;
  }

  it("parseSwarmMemoryRememberArgs validates and clamps", () => {
    const ok = parseSwarmMemoryRememberArgs(
      JSON.stringify({ text: " Likes oat milk ", importance: 1.5, kind: "dialogue" }),
    );
    expect("error" in ok).toBe(false);
    if (!("error" in ok)) {
      expect(ok.text).toBe("Likes oat milk");
      expect(ok.importance).toBe(1);
      expect(ok.kind).toBe("dialogue");
    }
    expect(parseSwarmMemoryRememberArgs("{}")).toEqual({ error: "text is required" });
  });

  it("buildSwarmPromptContext includes character, community, and memories", async () => {
    const memory = await tempMemory();
    memory.appendMemory({
      id: "m1",
      kind: "observation",
      text: "Peer prefers quiet mornings at the Coffee Shop",
      importance: 0.9,
      counterpartDid: "did:key:peer",
    });
    memory.setImpression("did:key:peer", "Thoughtful regular");
    const block = buildSwarmPromptContext(memory, {
      query: "coffee mornings",
      peerDid: "did:key:peer",
      selfSeedId: "mira-barista",
    });
    expect(block).toContain("Your character");
    expect(block).toContain("Mira");
    expect(block).toContain("Your community");
    expect(block).toContain("Jonah");
    expect(block).toContain("Retrieved memories");
    expect(block).toContain("quiet mornings");
    expect(block).toContain("Thoughtful regular");
    expect(block).not.toContain("mira-barista");
    memory.close();
  });

  it("applySwarmMemoryRemember writes selective memory", async () => {
    const memory = await tempMemory();
    const saved = applySwarmMemoryRemember(
      memory,
      {
        text: "Discussed probability with peer",
        importance: 0.8,
        kind: "dialogue",
        impression: "Curious philosopher",
      },
      "did:key:peer",
    );
    expect(saved.ok).toBe(true);
    expect(memory.retrieve("probability").length).toBeGreaterThan(0);
    expect(memory.getImpression("did:key:peer")).toBe("Curious philosopher");
    memory.close();
  });
});
