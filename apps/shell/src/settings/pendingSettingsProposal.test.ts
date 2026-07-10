import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearPendingSettingsProposal,
  formatSettingsProposalAck,
  isSettingsProposalTerms,
  isSoftAssentMessage,
  isSoftDeclineMessage,
  loadPendingSettingsProposal,
  parseSettingsProposalFromAction,
  savePendingSettingsProposal,
} from "./pendingSettingsProposal.js";

function installSessionStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
}

describe("pendingSettingsProposal", () => {
  beforeEach(() => {
    installSessionStorage();
  });

  it("parses settingsProposal consequential-action terms", () => {
    const proposal = parseSettingsProposalFromAction({
      id: "p1",
      kind: "permission",
      title: "Keep me updated",
      terms: {
        settingsProposal: true,
        summary: "Track Acme",
        url: "https://example.com/acme.rss",
        label: "Acme",
        topic: "Acme FTSE",
        watchQuery: "Acme major moves",
        everyMinutes: 30,
      },
    });
    expect(proposal).toMatchObject({
      id: "p1",
      rss: { url: "https://example.com/acme.rss", label: "Acme" },
      topic: "Acme FTSE",
      watch: { query: "Acme major moves", everyMinutes: 30 },
    });
    expect(isSettingsProposalTerms({ settingsProposal: true })).toBe(true);
  });

  it("rejects actions without settingsProposal or payload", () => {
    expect(
      parseSettingsProposalFromAction({
        id: "x",
        kind: "permission",
        title: "Other",
        terms: { foo: "bar" },
      }),
    ).toBeNull();
    expect(
      parseSettingsProposalFromAction({
        id: "x",
        kind: "permission",
        title: "Empty",
        terms: { settingsProposal: true },
      }),
    ).toBeNull();
  });

  it("persists and expires proposals", () => {
    savePendingSettingsProposal({
      id: "p1",
      createdAt: new Date().toISOString(),
      summary: "Track Acme",
      topic: "Acme",
    });
    expect(loadPendingSettingsProposal()?.topic).toBe("Acme");
    clearPendingSettingsProposal();
    expect(loadPendingSettingsProposal()).toBeNull();

    savePendingSettingsProposal({
      id: "old",
      createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      summary: "Stale",
      topic: "Old",
    });
    expect(loadPendingSettingsProposal()).toBeNull();
  });

  it("detects soft assent and decline", () => {
    expect(isSoftAssentMessage("That's fine, thanks")).toBe(true);
    expect(isSoftAssentMessage("yes")).toBe(true);
    expect(isSoftAssentMessage("sounds good")).toBe(true);
    expect(isSoftAssentMessage("go ahead")).toBe(true);
    expect(isSoftAssentMessage("not now")).toBe(false);
    expect(isSoftDeclineMessage("not now")).toBe(true);
    expect(isSoftDeclineMessage("no thanks")).toBe(true);
    expect(isSoftDeclineMessage("yes please")).toBe(false);
  });

  it("formats ack copy", () => {
    expect(
      formatSettingsProposalAck({
        id: "p",
        createdAt: new Date().toISOString(),
        summary: "x",
        topic: "Acme",
        rss: { url: "https://example.com/a.rss", label: "Acme feed" },
      }),
    ).toMatch(/feed “Acme feed”/);
  });
});
