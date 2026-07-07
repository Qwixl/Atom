import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  bridgeChatModuleEvent,
  COMMS_MODULE_BRIDGE_KEY,
  takeCommsModuleBridge,
} from "./moduleBridge.js";

const sessionStore = new Map<string, string>();

describe("bridgeChatModuleEvent", () => {
  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
      clear: () => sessionStore.clear(),
    });
  });

  it("bridges meetingProposed", () => {
    const slots = [{ start: "2026-07-08T10:00:00Z", end: "2026-07-08T10:30:00Z" }];
    expect(bridgeChatModuleEvent("meetingProposed", { title: "Standup", slots })).toBe(true);
    expect(takeCommsModuleBridge()).toEqual({
      action: "meetingProposed",
      title: "Standup",
      slots,
    });
  });

  it("bridges pollCreated", () => {
    expect(
      bridgeChatModuleEvent("pollCreated", {
        question: "Lunch?",
        options: [
          { id: "a", label: "Pizza" },
          { id: "b", label: "Salad" },
        ],
      }),
    ).toBe(true);
    expect(takeCommsModuleBridge()?.action).toBe("pollCreated");
  });

  it("bridges listCreated", () => {
    expect(
      bridgeChatModuleEvent("listCreated", {
        title: "Groceries",
        items: [{ id: "1", text: "Milk", done: false }],
      }),
    ).toBe(true);
    expect(takeCommsModuleBridge()).toEqual({
      action: "listCreated",
      title: "Groceries",
      items: [{ id: "1", text: "Milk", done: false }],
    });
  });

  it("rejects empty listCreated payloads", () => {
    expect(bridgeChatModuleEvent("listCreated", { title: "Empty", items: [] })).toBe(false);
    expect(sessionStorage.getItem(COMMS_MODULE_BRIDGE_KEY)).toBeNull();
  });

  it("bridges splitProposed", () => {
    expect(
      bridgeChatModuleEvent("splitProposed", {
        label: "Dinner",
        totalMinor: 8000,
        currency: "USD",
        splitCount: 4,
        shareMinor: 2000,
      }),
    ).toBe(true);
    expect(takeCommsModuleBridge()).toEqual({
      action: "splitProposed",
      label: "Dinner",
      totalMinor: 8000,
      currency: "USD",
      splitCount: 4,
      shareMinor: 2000,
    });
  });
});
