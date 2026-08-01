import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  ROOM_MESSAGE_PURPOSE,
  ROOM_RECEIPT_PURPOSE,
  ROOM_RECEIPT_SCHEMA,
} from "./constants.js";
import {
  createRoomMessage,
  createRoomReceipt,
  roomObjectChainHash,
  verifyRoomObject,
  verifyRoomReceipt,
} from "./groupObjects.js";

const ROOM_ID = "room:receipt-test";

describe("room:receipt (RI-05)", () => {
  it("round-trips create/verify with host DID and objectHash binding", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const message = await createRoomMessage({
      identity: member,
      payload: { roomId: ROOM_ID, text: "hello", n: 0 },
    });
    const objectHash = roomObjectChainHash(message);
    const receipt = await createRoomReceipt({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        objectId: message.id,
        objectHash,
        seq: 3,
        acceptedAt: "2026-07-31T21:00:00.000Z",
      },
    });
    expect(receipt.governance.purpose).toBe(ROOM_RECEIPT_PURPOSE);
    expect(receipt.semantic.schema).toBe(ROOM_RECEIPT_SCHEMA);
    expect(receipt.issuerDid).toBe(host.did);

    const verified = await verifyRoomReceipt(receipt, {
      expectedHostDid: host.did,
      expectedRoomId: ROOM_ID,
      expectedObjectHash: objectHash,
      expectedObjectId: message.id,
    });
    expect(verified.payload.objectId).toBe(message.id);
    expect(verified.payload.seq).toBe(3);
  });

  it("rejects wrong host DID even when signature is valid", async () => {
    const host = await generateAgentKeyPair();
    const other = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const message = await createRoomMessage({
      identity: member,
      payload: { roomId: ROOM_ID, text: "hello", n: 0 },
    });
    const objectHash = roomObjectChainHash(message);
    const receipt = await createRoomReceipt({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        objectId: message.id,
        objectHash,
        seq: 1,
        acceptedAt: "2026-07-31T21:00:00.000Z",
      },
    });
    await expect(
      verifyRoomReceipt(receipt, {
        expectedHostDid: other.did,
        expectedRoomId: ROOM_ID,
        expectedObjectHash: objectHash,
        expectedObjectId: message.id,
      }),
    ).rejects.toThrow(/does not match expected host/);
  });

  it("rejects cross-room replay", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const message = await createRoomMessage({
      identity: member,
      payload: { roomId: ROOM_ID, text: "hello", n: 0 },
    });
    const objectHash = roomObjectChainHash(message);
    const receipt = await createRoomReceipt({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        objectId: message.id,
        objectHash,
        seq: 1,
        acceptedAt: "2026-07-31T21:00:00.000Z",
      },
    });
    await expect(
      verifyRoomReceipt(receipt, {
        expectedHostDid: host.did,
        expectedRoomId: "room:other",
        expectedObjectHash: objectHash,
        expectedObjectId: message.id,
      }),
    ).rejects.toThrow(/cross-room replay/);
  });

  it("rejects objectHash mismatch", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const message = await createRoomMessage({
      identity: member,
      payload: { roomId: ROOM_ID, text: "hello", n: 0 },
    });
    const receipt = await createRoomReceipt({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        objectId: message.id,
        objectHash: roomObjectChainHash(message),
        seq: 1,
        acceptedAt: "2026-07-31T21:00:00.000Z",
      },
    });
    await expect(
      verifyRoomReceipt(receipt, {
        expectedHostDid: host.did,
        expectedRoomId: ROOM_ID,
        expectedObjectHash: "not-the-real-hash",
        expectedObjectId: message.id,
      }),
    ).rejects.toThrow(/objectHash does not match/);
  });

  it("rejects objectId mismatch", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const message = await createRoomMessage({
      identity: member,
      payload: { roomId: ROOM_ID, text: "hello", n: 0 },
    });
    const receipt = await createRoomReceipt({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        objectId: message.id,
        objectHash: roomObjectChainHash(message),
        seq: 1,
        acceptedAt: "2026-07-31T21:00:00.000Z",
      },
    });
    await expect(
      verifyRoomReceipt(receipt, {
        expectedHostDid: host.did,
        expectedRoomId: ROOM_ID,
        expectedObjectHash: roomObjectChainHash(message),
        expectedObjectId: "different-object-id",
      }),
    ).rejects.toThrow(/objectId does not match/);
  });

  it("is not admitted via verifyRoomObject fan-out allowlist", async () => {
    const host = await generateAgentKeyPair();
    const receipt = await createRoomReceipt({
      identity: host,
      payload: {
        roomId: ROOM_ID,
        objectId: "obj-1",
        objectHash: "hash",
        seq: 1,
        acceptedAt: "2026-07-31T21:00:00.000Z",
      },
    });
    await expect(verifyRoomObject(receipt)).rejects.toThrow();
    expect(receipt.governance.purpose).not.toBe(ROOM_MESSAGE_PURPOSE);
  });
});
