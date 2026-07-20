import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatSocialTurnBudget,
  looksLikeGoodbye,
  SOCIAL_MAX_MESSAGES,
  SOCIAL_MIN_MESSAGES,
  SwarmSocialDialogueStore,
} from "./swarmSocialDialogue.js";

describe("swarmSocialDialogue", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function tempStore(): SwarmSocialDialogueStore {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-social-"));
    dirs.push(dir);
    const store = new SwarmSocialDialogueStore(path.join(dir, "swarm-social.json"));
    store.load();
    return store;
  }

  it("enforces opener daily cap and pair cooldown", () => {
    const store = tempStore();
    expect(store.canStartOpener("did:b").ok).toBe(true);
    store.startDialogue("did:b", "initiator", { sentByUs: 1 });
    expect(store.canStartOpener("did:c").ok).toBe(false);
    store.closeDialogue("did:b");
    expect(store.canStartOpener("did:b").ok).toBe(false);
    expect(store.openersToday()).toBe(1);
  });

  it("formats turn budgets for min/max", () => {
    expect(formatSocialTurnBudget(2)).toMatch(/must continue/i);
    expect(formatSocialTurnBudget(SOCIAL_MIN_MESSAGES)).toMatch(/may continue|goodbye/i);
    expect(formatSocialTurnBudget(SOCIAL_MAX_MESSAGES)).toMatch(/must say goodbye/i);
  });

  it("detects goodbye phrases", () => {
    expect(looksLikeGoodbye("Talk soon, Jonah!")).toBe(true);
    expect(looksLikeGoodbye("How is the espresso today?")).toBe(false);
  });
});
