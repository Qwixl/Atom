import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  applyCuratorBriefingTopics,
  loadBriefingPreferences,
  rememberBriefingTopic,
  saveBriefingPreferences,
} from "./briefingPreferences.js";

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

describe("briefingPreferences", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it("rememberBriefingTopic dedupes and caps topics", () => {
    saveBriefingPreferences({ enabled: true, topics: ["tech"] });
    rememberBriefingTopic("politics");
    rememberBriefingTopic("tech");
    expect(loadBriefingPreferences().topics).toEqual(["tech", "politics"]);
  });

  it("applyCuratorBriefingTopics skips when briefing disabled", () => {
    saveBriefingPreferences({ enabled: false, topics: [] });
    applyCuratorBriefingTopics([
      { category: "briefing-topics", label: "topic", value: "climate" },
    ]);
    expect(loadBriefingPreferences().topics).toEqual([]);
  });

  it("applyCuratorBriefingTopics merges curator proposals when enabled", () => {
    saveBriefingPreferences({ enabled: true, topics: [] });
    applyCuratorBriefingTopics([
      { category: "briefing-topics", label: "topic", value: "product launches" },
      { category: "preferences", label: "seat", value: "aisle" },
    ]);
    expect(loadBriefingPreferences().topics).toEqual(["product launches"]);
  });
});
