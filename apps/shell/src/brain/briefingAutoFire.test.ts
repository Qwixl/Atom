import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  canRequestBriefingComposition,
  feedNeedsBriefingCompositionRecovery,
  shouldFireBriefingFromPending,
  shouldSessionOpenBriefing,
} from "./briefingAutoFire.js";
import { saveBriefingPreferences } from "../briefing/briefingPreferences.js";

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

describe("briefingAutoFire", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it("allows llm and ag-ui providers", () => {
    expect(canRequestBriefingComposition("llm")).toBe(true);
    expect(canRequestBriefingComposition("ag-ui")).toBe(true);
    expect(canRequestBriefingComposition("mock")).toBe(false);
  });

  it("session-open runs for ag-ui when prefs enabled", () => {
    saveBriefingPreferences({ enabled: true, topics: [] });
    expect(shouldSessionOpenBriefing({ provider: "ag-ui", alreadyRequested: false })).toBe(true);
    expect(shouldSessionOpenBriefing({ provider: "llm", alreadyRequested: false })).toBe(true);
    expect(shouldSessionOpenBriefing({ provider: "ag-ui", alreadyRequested: true })).toBe(false);
  });

  it("session-open skips when prefs disabled", () => {
    saveBriefingPreferences({ enabled: false, topics: [] });
    expect(shouldSessionOpenBriefing({ provider: "ag-ui", alreadyRequested: false })).toBe(false);
  });

  it("fires pending briefing once per id when not already requested", () => {
    expect(
      shouldFireBriefingFromPending({
        notification: {
          id: "b1",
          intentId: "i1",
          kind: "daily-briefing",
          title: "Morning",
          body: "Morning",
          createdAt: new Date().toISOString(),
        },
        alreadyRequested: false,
        handledIds: new Set(),
      }),
    ).toBe(true);
    expect(
      shouldFireBriefingFromPending({
        notification: {
          id: "b1",
          intentId: "i1",
          kind: "daily-briefing",
          title: "Morning",
          body: "Morning",
          createdAt: new Date().toISOString(),
        },
        alreadyRequested: true,
        handledIds: new Set(),
      }),
    ).toBe(false);
  });

  it("recovers stub brain briefing text without a surface", () => {
    expect(
      feedNeedsBriefingCompositionRecovery([
        {
          kind: "agent-text",
          id: "brain_1",
          text: "Morning briefing: Ask me for today's briefing when you're free",
          origin: "brain",
          brainKind: "daily-briefing",
        },
      ]),
    ).toBe(true);
    expect(
      feedNeedsBriefingCompositionRecovery([
        {
          kind: "surface",
          id: "s1",
          surface: {
            surfaceId: "briefing-daily",
            intent: "Daily briefing",
            root: { id: "r", component: "core/stack", props: {}, children: [] },
          } as never,
        },
      ]),
    ).toBe(false);
  });
});
