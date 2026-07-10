import { describe, expect, it } from "vitest";
import {
  emptySightingsFile,
  mergeSighting,
  mergeSightingsFiles,
  parseSightingsJson,
  saveSightingsToLocalStorage,
  loadSightingsFromLocalStorage,
  sightingsModelIds,
} from "./modelSightings.js";

describe("modelSightings", () => {
  it("merges counts for the same normalized model id", () => {
    let file = emptySightingsFile();
    file = mergeSighting(file, "gpt-4o-mini", "shell");
    file = mergeSighting(file, "GPT-4o-mini", "shell");
    expect(file.sightings).toHaveLength(1);
    expect(file.sightings[0]?.count).toBe(2);
  });

  it("rejects api-key-like model ids", () => {
    let file = emptySightingsFile();
    file = mergeSighting(file, "sk-abcdefghijklmnopqrstuvwxyz", "shell");
    expect(file.sightings).toHaveLength(0);
  });

  it("mergeSightingsFiles collapses provider-prefixed duplicates", () => {
    const a = mergeSighting(emptySightingsFile(), "openai/gpt-4o", "shell");
    const b = mergeSighting(emptySightingsFile(), "gpt-4o", "hosted");
    const merged = mergeSightingsFiles(a, b);
    expect(merged.sightings).toHaveLength(1);
    expect(merged.sightings[0]?.count).toBe(2);
    expect(merged.sightings[0]?.modelId).toBe("openai/gpt-4o");
  });

  it("round-trips JSON", () => {
    const file = mergeSighting(emptySightingsFile(), "claude-sonnet-4", "import");
    const again = parseSightingsJson(JSON.stringify(file));
    expect(sightingsModelIds(again)).toEqual(["claude-sonnet-4"]);
  });

  it("persists to injectable storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const file = mergeSighting(emptySightingsFile(), "llama-3.1-8b", "shell");
    saveSightingsToLocalStorage(file, storage);
    expect(loadSightingsFromLocalStorage(storage).sightings[0]?.modelId).toBe("llama-3.1-8b");
  });
});
