import { describe, expect, it } from "vitest";
import { createRoomMessage, roomObjectChainHash } from "@qwixl/a2a-transport";
import { generateAgentKeyPair, type AgentKeyPair, type DataObject } from "@qwixl/protocol";
import { reconcileHostTranscript } from "./roomReconcile.js";
import type { JoinedRoomMessage, RoomMessage } from "./roomStore.js";

const ROOM_ID = "room-1";

async function signed(
  identity: AgentKeyPair,
  text: string,
  n: number,
  roomId = ROOM_ID,
): Promise<DataObject> {
  return createRoomMessage({ identity, payload: { roomId, text, n } });
}

function hostMessage(
  seq: number,
  senderDid: string,
  text: string,
  object?: DataObject,
): RoomMessage {
  return {
    seq,
    roomId: ROOM_ID,
    senderDid,
    kind: "message",
    text,
    at: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
    object,
  } as RoomMessage;
}

function localMessage(object: DataObject, senderDid: string, text: string, n: number): JoinedRoomMessage {
  return {
    objectId: object.id,
    roomId: ROOM_ID,
    senderDid,
    kind: "message",
    text,
    at: object.issuedAt,
    n,
    continuity: "ok",
    object,
  };
}

describe("host transcript reconciliation", () => {
  it("marks a faithfully served signed message as verified", async () => {
    const alice = await generateAgentKeyPair();
    const object = await signed(alice, "hello", 0);
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [hostMessage(1, alice.did, "hello", object)],
      local: [],
      cutoff: { seq: 1 },
      fullRange: true,
    });
    expect(result.messages[0]?.verification).toBe("verified");
    expect(result.summary.verified).toBe(1);
  });

  it("catches a host that swaps the text but keeps the real signature", async () => {
    const alice = await generateAgentKeyPair();
    const object = await signed(alice, "transfer to alice", 0);
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      // Genuine object, tampered rendering.
      hostMessages: [hostMessage(1, alice.did, "transfer to mallory", object)],
      local: [],
      cutoff: { seq: 1 },
      fullRange: true,
    });
    const [message] = result.messages;
    expect(message?.verification).toBe("substituted");
    // The reader must be shown what was signed, not what was served.
    expect(message?.text).toBe("transfer to alice");
  });

  it("catches a host reattributing one member's message to another", async () => {
    const alice = await generateAgentKeyPair();
    const bob = await generateAgentKeyPair();
    const object = await signed(alice, "I agree", 0);
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [hostMessage(1, bob.did, "I agree", object)],
      local: [],
      cutoff: { seq: 1 },
      fullRange: true,
    });
    expect(result.messages[0]?.verification).toBe("invalid");
    expect(result.messages[0]?.verificationDetail).toMatch(/issued by/);
  });

  it("catches an object lifted from a different room", async () => {
    const alice = await generateAgentKeyPair();
    const object = await signed(alice, "elsewhere", 0, "other-room");
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [hostMessage(1, alice.did, "elsewhere", object)],
      local: [],
      cutoff: { seq: 1 },
      fullRange: true,
    });
    expect(result.messages[0]?.verification).toBe("invalid");
    expect(result.messages[0]?.verificationDetail).toMatch(/bound to room other-room/);
  });

  it("catches a forged signature", async () => {
    const alice = await generateAgentKeyPair();
    const object = await signed(alice, "authentic", 0);
    const forged = { ...object, payload: { ...object.payload, text: "forged" } } as DataObject;
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [hostMessage(1, alice.did, "forged", forged)],
      local: [],
      cutoff: { seq: 1 },
      fullRange: true,
    });
    expect(result.messages[0]?.verification).toBe("invalid");
  });

  it("separates pre-cutoff legacy from post-cutoff signature stripping", async () => {
    const alice = await generateAgentKeyPair();
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [
        hostMessage(1, alice.did, "old unsigned"),
        hostMessage(5, alice.did, "stripped"),
      ],
      local: [],
      cutoff: { seq: 3 },
      fullRange: true,
    });
    expect(result.messages[0]?.verification).toBe("legacy");
    expect(result.messages[1]?.verification).toBe("unsigned");
  });

  it("treats every unsigned message as legacy when no cutoff is known", async () => {
    const alice = await generateAgentKeyPair();
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [hostMessage(9, alice.did, "unsigned")],
      local: [],
      cutoff: undefined,
      fullRange: true,
    });
    expect(result.messages[0]?.verification).toBe("legacy");
  });

  it("applies a timestamp cutoff when the member has no host seq to anchor to", async () => {
    const alice = await generateAgentKeyPair();
    const early = hostMessage(1, alice.did, "before");
    const late = hostMessage(9, alice.did, "after");
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [early, late],
      local: [],
      cutoff: { at: late.at },
      fullRange: true,
    });
    expect(result.messages[0]?.verification).toBe("legacy");
    expect(result.messages[1]?.verification).toBe("unsigned");
  });

  it("reports a message the member received but the host withheld", async () => {
    const alice = await generateAgentKeyPair();
    const kept = await signed(alice, "kept", 0);
    const dropped = await signed(alice, "inconvenient", 1);
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [hostMessage(1, alice.did, "kept", kept)],
      local: [
        localMessage(kept, alice.did, "kept", 0),
        localMessage(dropped, alice.did, "inconvenient", 1),
      ],
      cutoff: { seq: 1 },
      fullRange: true,
    });
    expect(result.summary.omitted).toBe(1);
    expect(result.omissions[0]?.text).toBe("inconvenient");
    // Omissions must not be spliced into the ordered transcript: they have no
    // host seq, and the reader's dedup is keyed on seq.
    expect(result.messages).toHaveLength(1);
  });

  it("does not cry omission on an incremental poll", async () => {
    const alice = await generateAgentKeyPair();
    const older = await signed(alice, "older", 0);
    const newer = await signed(alice, "newer", 1);
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      // An `after=` poll legitimately excludes anything below the watermark.
      hostMessages: [hostMessage(2, alice.did, "newer", newer)],
      local: [
        localMessage(older, alice.did, "older", 0),
        localMessage(newer, alice.did, "newer", 1),
      ],
      cutoff: { seq: 1 },
      fullRange: false,
    });
    expect(result.summary.omitted).toBe(0);
  });

  it("does not report messages still buffered behind a gap as omitted", async () => {
    const alice = await generateAgentKeyPair();
    const pending = await signed(alice, "pending", 4);
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [],
      local: [{ ...localMessage(pending, alice.did, "pending", 4), continuity: "pending" }],
      cutoff: { seq: 1 },
      fullRange: true,
    });
    expect(result.summary.omitted).toBe(0);
  });

  it("verifies archived messages whose TTL has long since lapsed", async () => {
    const alice = await generateAgentKeyPair();
    const object = await createRoomMessage({
      identity: alice,
      payload: { roomId: ROOM_ID, text: "ancient", n: 0 },
      ttlSeconds: 1,
    });
    // Chain hash is content-derived, so an expired object is still self-describing.
    expect(roomObjectChainHash(object)).toBeTruthy();
    const result = await reconcileHostTranscript({
      roomId: ROOM_ID,
      hostMessages: [hostMessage(1, alice.did, "ancient", object)],
      local: [],
      cutoff: { seq: 1 },
      fullRange: true,
    });
    expect(result.messages[0]?.verification).toBe("verified");
  });
});
