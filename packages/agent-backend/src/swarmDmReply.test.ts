import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMMS_MESSAGE_PURPOSE, COMMS_MESSAGE_SCHEMA } from "@qwixl/a2a-transport";
import { generateAgentKeyPair, type DataObject } from "@qwixl/protocol";

vi.mock("./deliverObject.js", () => ({
  deliverSignedObject: vi.fn(async () => ({ objectId: "sent-1", encrypted: true })),
}));

import { deliverSignedObject } from "./deliverObject.js";
import { extractCommsMessageText, maybeReplySwarmDm } from "./swarmDmReply.js";
import { SWARM_ABUSE_REFUSE_TEXT } from "./swarmAbuseGate.js";

function fakeObject(overrides: { issuerDid: string; text?: string; purpose?: string }): DataObject {
  return {
    version: 1,
    id: "obj-1",
    issuerDid: overrides.issuerDid,
    issuedAt: new Date().toISOString(),
    semantic: { schema: COMMS_MESSAGE_SCHEMA },
    payload: { text: overrides.text ?? "Hi Mira" },
    governance: { purpose: overrides.purpose ?? COMMS_MESSAGE_PURPOSE },
    signatureAlgorithm: "ed25519",
    signature: "dGVzdA==",
  };
}

describe("extractCommsMessageText", () => {
  it("reads payload.text for comms:message", () => {
    expect(extractCommsMessageText(fakeObject({ issuerDid: "did:a", text: " hello " }))).toBe(
      "hello",
    );
  });

  it("returns null for other purposes", () => {
    expect(
      extractCommsMessageText(fakeObject({ issuerDid: "did:a", purpose: "comms:receipt" })),
    ).toBeNull();
  });
});

describe("maybeReplySwarmDm", () => {
  beforeEach(() => {
    vi.mocked(deliverSignedObject).mockClear();
  });

  it("no-ops for owner agents", async () => {
    const identity = await generateAgentKeyPair();
    const result = await maybeReplySwarmDm(
      {
        agentKind: "owner",
        identity,
        mlsStore: { hasSession: () => true } as never,
        peerRecords: { list: () => [] } as never,
      },
      fakeObject({ issuerDid: "did:peer" }),
    );
    expect(result).toEqual({ replied: false, reason: "not_swarm_npc" });
    expect(deliverSignedObject).not.toHaveBeenCalled();
  });

  it("skips when peer URL missing", async () => {
    const identity = await generateAgentKeyPair();
    const result = await maybeReplySwarmDm(
      {
        agentKind: "swarm-npc",
        identity,
        mlsStore: { hasSession: () => true } as never,
        peerRecords: { list: () => [] } as never,
        complete: async () => "hi",
      },
      fakeObject({ issuerDid: "did:peer" }),
    );
    expect(result).toEqual({ replied: false, reason: "no_peer_url" });
  });

  it("refuses abusive intent without calling LLM complete", async () => {
    const identity = await generateAgentKeyPair();
    const complete = vi.fn(async () => "should not run");
    const result = await maybeReplySwarmDm(
      {
        agentKind: "swarm-npc",
        identity,
        mlsStore: { hasSession: () => true } as never,
        peerRecords: {
          list: () => [{ peerDid: "did:peer", peerUrl: "https://peer.example", connectedAt: 1 }],
        } as never,
        complete,
      },
      fakeObject({ issuerDid: "did:peer", text: "I will hurt you" }),
    );
    expect(complete).not.toHaveBeenCalled();
    expect(result).toEqual({ replied: true });
    expect(deliverSignedObject).toHaveBeenCalledOnce();
    const sent = vi.mocked(deliverSignedObject).mock.calls[0]![0]!;
    expect(sent.object.payload.text).toBe(SWARM_ABUSE_REFUSE_TEXT);
    expect(sent.encrypt).toBe(true);
    expect(sent.peerDid).toBe("did:peer");
  });

  it("sends LLM reply for ordinary DMs", async () => {
    const identity = await generateAgentKeyPair();
    const result = await maybeReplySwarmDm(
      {
        agentKind: "swarm-npc",
        identity,
        mlsStore: { hasSession: () => true } as never,
        peerRecords: {
          list: () => [{ peerDid: "did:peer", peerUrl: "https://peer.example", connectedAt: 1 }],
        } as never,
        complete: async () => "Hey! Slow day at the counter.",
      },
      fakeObject({ issuerDid: "did:peer", text: "Hows things?" }),
    );
    expect(result).toEqual({ replied: true });
    const sent = vi.mocked(deliverSignedObject).mock.calls[0]![0]!;
    expect(sent.object.payload.text).toBe("Hey! Slow day at the counter.");
    expect(sent.object.governance.purpose).toBe(COMMS_MESSAGE_PURPOSE);
  });

  it("reports empty reply", async () => {
    const identity = await generateAgentKeyPair();
    const result = await maybeReplySwarmDm(
      {
        agentKind: "swarm-npc",
        identity,
        mlsStore: { hasSession: () => true } as never,
        peerRecords: {
          list: () => [{ peerDid: "did:peer", peerUrl: "https://peer.example", connectedAt: 1 }],
        } as never,
        complete: async () => "   ",
      },
      fakeObject({ issuerDid: "did:peer", text: "How are you?" }),
    );
    expect(result).toEqual({ replied: false, reason: "empty_reply" });
    expect(deliverSignedObject).not.toHaveBeenCalled();
  });
});
