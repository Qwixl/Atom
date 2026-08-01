import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  ROOM_CHECKPOINT_PURPOSE,
  ROOM_CHECKPOINT_SCHEMA,
  ROOM_MESSAGE_PURPOSE,
} from "./constants.js";
import {
  checkpointOverlapVerdict,
  createRoomCheckpoint,
  createRoomMessage,
  roomObjectChainHash,
  verifyRoomCheckpoint,
  verifyRoomObject,
} from "./groupObjects.js";

const ROOM_ID = "room:checkpoint-test";

describe("room:checkpoint (RI-06)", () => {
  it("round-trips create/verify with host DID and contiguous entries", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const a = await createRoomMessage({
      identity: member,
      payload: { roomId: ROOM_ID, text: "a", n: 0 },
    });
    const b = await createRoomMessage({
      identity: member,
      payload: { roomId: ROOM_ID, text: "b", n: 1, prevHash: roomObjectChainHash(a) },
    });
    const checkpoint = await createRoomCheckpoint({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        fromSeq: 1,
        toSeq: 2,
        entries: [
          { seq: 1, objectHash: roomObjectChainHash(a) },
          { seq: 2, objectHash: roomObjectChainHash(b) },
        ],
      },
    });
    expect(checkpoint.governance.purpose).toBe(ROOM_CHECKPOINT_PURPOSE);
    expect(checkpoint.semantic.schema).toBe(ROOM_CHECKPOINT_SCHEMA);
    const verified = await verifyRoomCheckpoint(checkpoint, {
      expectedHostDid: host.did,
      expectedRoomId: ROOM_ID,
    });
    expect(verified.payload.entries).toHaveLength(2);
  });

  it("rejects gapped entries", async () => {
    const host = await generateAgentKeyPair();
    await expect(
      createRoomCheckpoint({
        identity: host,
        payload: {
          roomId: ROOM_ID,
          fromSeq: 1,
          toSeq: 3,
          entries: [
            { seq: 1, objectHash: "h1" },
            { seq: 3, objectHash: "h3" },
          ],
        },
      }),
    ).rejects.toThrow(/cover every seq|strictly increasing/);
  });

  it("rejects wrong host DID", async () => {
    const host = await generateAgentKeyPair();
    const other = await generateAgentKeyPair();
    const checkpoint = await createRoomCheckpoint({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        fromSeq: 1,
        toSeq: 1,
        entries: [{ seq: 1, objectHash: "h1" }],
      },
    });
    await expect(
      verifyRoomCheckpoint(checkpoint, {
        expectedHostDid: other.did,
        expectedRoomId: ROOM_ID,
      }),
    ).rejects.toThrow(/does not match expected host/);
  });

  it("rejects cross-room replay", async () => {
    const host = await generateAgentKeyPair();
    const checkpoint = await createRoomCheckpoint({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        fromSeq: 1,
        toSeq: 1,
        entries: [{ seq: 1, objectHash: "h1" }],
      },
    });
    await expect(
      verifyRoomCheckpoint(checkpoint, {
        expectedHostDid: host.did,
        expectedRoomId: "room:other",
      }),
    ).rejects.toThrow(/cross-room replay/);
  });

  it("is not admitted via verifyRoomObject fan-out allowlist", async () => {
    const host = await generateAgentKeyPair();
    const checkpoint = await createRoomCheckpoint({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        fromSeq: 1,
        toSeq: 1,
        entries: [{ seq: 1, objectHash: "h1" }],
      },
    });
    await expect(verifyRoomObject(checkpoint)).rejects.toThrow();
    expect(checkpoint.governance.purpose).not.toBe(ROOM_MESSAGE_PURPOSE);
  });

  it("detects overlapping hash contradictions", () => {
    const a = {
      roomId: ROOM_ID,
      fromSeq: 1,
      toSeq: 2,
      entries: [
        { seq: 1, objectHash: "h1" },
        { seq: 2, objectHash: "h2" },
      ],
    };
    const b = {
      roomId: ROOM_ID,
      fromSeq: 2,
      toSeq: 3,
      entries: [
        { seq: 2, objectHash: "DIFFERENT" },
        { seq: 3, objectHash: "h3" },
      ],
    };
    expect(checkpointOverlapVerdict(a, b)).toBe("contradict");
    expect(
      checkpointOverlapVerdict(a, {
        roomId: ROOM_ID,
        fromSeq: 2,
        toSeq: 3,
        entries: [
          { seq: 2, objectHash: "h2" },
          { seq: 3, objectHash: "h3" },
        ],
      }),
    ).toBe("agree");
    expect(
      checkpointOverlapVerdict(a, {
        roomId: ROOM_ID,
        fromSeq: 3,
        toSeq: 3,
        entries: [{ seq: 3, objectHash: "h3" }],
      }),
    ).toBe("disjoint");
  });
});
