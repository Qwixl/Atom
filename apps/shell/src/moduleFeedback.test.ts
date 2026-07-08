import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  COMMS_ABUSE_CATEGORIES,
  MODULE_ABUSE_CATEGORIES,
  submitCommsAbuseReport,
  submitModuleAbuseReport,
} from "./moduleFeedback.js";

describe("moduleFeedback abuse report", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes abuse categories for the report UI", () => {
    expect(MODULE_ABUSE_CATEGORIES.some((c) => c.id === "malware")).toBe(true);
    expect(COMMS_ABUSE_CATEGORIES.some((c) => c.id === "csam")).toBe(true);
  });

  it("posts module abuse reports to the control plane", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ received: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await submitModuleAbuseReport({
      moduleId: "games/tictactoe",
      version: "1.0.0",
      category: "malware",
      details: "executes unexpected fetch",
      publisher: "did:example:pub",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/module-abuse-report");
    expect(JSON.parse(String(init.body))).toMatchObject({
      moduleId: "games/tictactoe",
      version: "1.0.0",
      category: "malware",
    });
  });

  it("posts comms abuse reports and escalates hosted endpoints", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ received: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await submitCommsAbuseReport({
      peerDid: "did:key:peer",
      category: "harassment",
      details: "repeated threats",
      peerEndpoint: "https://alice.agents.qwixl.dev",
      alsoBlock: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [commsUrl, commsInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(commsUrl).toContain("/comms-abuse-report");
    expect(JSON.parse(String(commsInit.body))).toMatchObject({
      peerDid: "did:key:peer",
      category: "harassment",
      alsoBlock: true,
    });
    const [hostedUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(hostedUrl).toContain("/report-abuse");
  });
});
