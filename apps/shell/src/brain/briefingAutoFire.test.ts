import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  canRequestBriefingComposition,
  feedNeedsBriefingCompositionRecovery,
  hasBriefingCompositionBeenRequestedThisSession,
  markBriefingCompositionRequestedThisSession,
  shouldFireBriefingFromPending,
  shouldRecoverBriefingComposition,
  shouldSessionOpenBriefing,
} from "./briefingAutoFire.js";
import { saveBriefingPreferences } from "../briefing/briefingPreferences.js";

function installStorageMocks(): void {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => {
      local.set(key, value);
    },
    removeItem: (key: string) => {
      local.delete(key);
    },
    clear: () => {
      local.clear();
    },
  });
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => {
      session.set(key, value);
    },
    removeItem: (key: string) => {
      session.delete(key);
    },
    clear: () => {
      session.clear();
    },
  });
}

describe("briefingAutoFire", () => {
  beforeEach(() => {
    installStorageMocks();
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

  it("session-open skips after composition already requested this tab session", () => {
    saveBriefingPreferences({ enabled: true, topics: [] });
    markBriefingCompositionRequestedThisSession();
    expect(hasBriefingCompositionBeenRequestedThisSession()).toBe(true);
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

  it("does not recover thin morning-briefing badges or is-ready lines", () => {
    expect(
      feedNeedsBriefingCompositionRecovery([
        {
          kind: "agent-text",
          id: "brain_1",
          text: "Morning briefing",
          origin: "brain",
          brainKind: "daily-briefing",
        },
      ]),
    ).toBe(false);
    expect(
      feedNeedsBriefingCompositionRecovery([
        {
          kind: "agent-text",
          id: "brain_2",
          text: "Morning briefing is ready.",
          origin: "brain",
          brainKind: "daily-briefing",
        },
      ]),
    ).toBe(false);
  });

  it("recovers legacy ask-me stub without a surface", () => {
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
      shouldRecoverBriefingComposition({
        provider: "ag-ui",
        alreadyRequested: false,
        feed: [
          {
            kind: "agent-text",
            id: "brain_1",
            text: "Ask me for today's briefing",
            origin: "brain",
            brainKind: "daily-briefing",
          },
        ],
      }),
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
