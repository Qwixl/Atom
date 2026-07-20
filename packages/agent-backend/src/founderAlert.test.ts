import { describe, expect, it, vi } from "vitest";
import { sendFounderAlert } from "./founderAlert.js";

describe("sendFounderAlert", () => {
  it("posts inject payload to founder agent", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await sendFounderAlert(
      {
        founderAgentBaseUrl: "http://127.0.0.1:5204",
        founderAdminToken: "secret",
      },
      {
        id: "f1",
        title: "pause",
        body: "npc misbehaved",
        severity: "warning",
        npcDid: "did:npc",
        proposedAction: "pause_npc",
        createdAt: new Date().toISOString(),
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/brain/pending/inject");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret",
    });
  });
});
