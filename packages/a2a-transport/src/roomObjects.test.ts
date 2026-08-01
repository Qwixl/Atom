import { describe, expect, it } from "vitest";
import {
  generateAgentKeyPair,
  ReplayGuard,
  signDataObject,
} from "@qwixl/protocol";
import {
  COORDINATION_PROPOSAL_PURPOSE,
  ROOM_ACTIVITY_PURPOSE,
  ROOM_ACTIVITY_SCHEMA,
  ROOM_INVITE_PURPOSE,
  ROOM_INVITE_SCHEMA,
  ROOM_MESSAGE_PURPOSE,
  ROOM_MESSAGE_SCHEMA,
  ROOM_MEMBER_UPDATE_PURPOSE,
  ROOM_MEMBER_UPDATE_SCHEMA,
  ROOM_MODERATION_PURPOSE,
  ROOM_MODERATION_SCHEMA,
  ROOM_MUTATION_PURPOSE,
  SCHEDULING_PROPOSAL_SCHEMA,
} from "./constants.js";
import { createSchedulingProposal } from "./coordination.js";
import {
  createRoomActivity,
  createRoomInvite,
  createRoomMemberUpdate,
  createRoomMessage,
  createRoomModeration,
  createRoomMutation,
  roomObjectChainHash,
  verifyRoomActivity,
  verifyRoomInvite,
  verifyRoomMemberUpdate,
  verifyRoomMessage,
  verifyRoomModeration,
  verifyRoomMutation,
  verifyRoomObject,
} from "./groupObjects.js";

const ROOM_ID = "room-abc";

describe("room signed data objects", () => {
  it("round-trips create → verify for all five purposes", async () => {
    const identity = await generateAgentKeyPair();
    const subject = await generateAgentKeyPair();

    const message = await createRoomMessage({
      identity,
      payload: { roomId: ROOM_ID, text: "hello room", n: 0 },
    });
    const verifiedMessage = await verifyRoomMessage(message);
    expect(verifiedMessage.payload.text).toBe("hello room");
    expect(verifiedMessage.object.governance.purpose).toBe(ROOM_MESSAGE_PURPOSE);

    const activity = await createRoomActivity({
      identity,
      payload: {
        roomId: ROOM_ID,
        activityKind: "reaction",
        payload: { emoji: "👍" },
        n: 1,
        prevHash: roomObjectChainHash(message),
      },
    });
    const verifiedActivity = await verifyRoomActivity(activity);
    expect(verifiedActivity.payload.activityKind).toBe("reaction");
    expect(verifiedActivity.object.governance.purpose).toBe(ROOM_ACTIVITY_PURPOSE);

    const mutation = await createRoomMutation({
      identity,
      payload: {
        roomId: ROOM_ID,
        action: "edit",
        targetObjectId: message.id,
        text: "hello again",
        n: 2,
        prevHash: roomObjectChainHash(activity),
      },
    });
    const verifiedMutation = await verifyRoomMutation(mutation);
    expect(verifiedMutation.payload.action).toBe("edit");
    expect(verifiedMutation.object.governance.purpose).toBe(ROOM_MUTATION_PURPOSE);

    const moderation = await createRoomModeration({
      identity,
      payload: {
        roomId: ROOM_ID,
        action: "mute",
        subjectDid: subject.did,
        effectiveFrom: "2026-07-31T00:00:00.000Z",
        effectiveUntil: "2026-07-31T01:00:00.000Z",
      },
    });
    const verifiedModeration = await verifyRoomModeration(moderation);
    expect(verifiedModeration.payload.action).toBe("mute");
    expect(verifiedModeration.object.governance.purpose).toBe(ROOM_MODERATION_PURPOSE);

    const memberUpdate = await createRoomMemberUpdate({
      identity,
      payload: {
        roomId: ROOM_ID,
        joined: [subject.did],
        left: [],
        evicted: [],
      },
    });
    const verifiedMemberUpdate = await verifyRoomMemberUpdate(memberUpdate);
    expect(verifiedMemberUpdate.payload.joined).toEqual([subject.did]);
    expect(verifiedMemberUpdate.object.governance.purpose).toBe(ROOM_MEMBER_UPDATE_PURPOSE);

    const dispatched = await verifyRoomObject(message);
    expect(dispatched.purpose).toBe(ROOM_MESSAGE_PURPOSE);
  });

  it("roomObjectChainHash is stable across re-serialization and signature changes", async () => {
    const identity = await generateAgentKeyPair();
    const object = await createRoomMessage({
      identity,
      payload: { roomId: ROOM_ID, text: "chain test", n: 0 },
    });
    const reparsed = JSON.parse(JSON.stringify(object)) as typeof object;
    expect(roomObjectChainHash(object)).toBe(roomObjectChainHash(reparsed));

    const differentSignature = { ...object, signature: `alt-${object.signature}` };
    expect(roomObjectChainHash(object)).toBe(roomObjectChainHash(differentSignature));

    const other = await createRoomMessage({
      identity,
      payload: { roomId: ROOM_ID, text: "other text", n: 0 },
    });
    expect(roomObjectChainHash(object)).not.toBe(roomObjectChainHash(other));
  });

  it("rejects hostile message payloads", async () => {
    const identity = await generateAgentKeyPair();
    const base = { roomId: ROOM_ID, text: "x" };

    await expect(
      createRoomMessage({ identity, payload: { ...base, n: "3" as unknown as number } }),
    ).rejects.toThrow(/non-negative integer/);
    await expect(
      createRoomMessage({ identity, payload: { ...base, n: 3.5 } }),
    ).rejects.toThrow(/non-negative integer/);
    await expect(
      createRoomMessage({ identity, payload: { ...base, n: -1 } }),
    ).rejects.toThrow(/non-negative integer/);
    await expect(
      createRoomMessage({
        identity,
        payload: { roomId: "", text: "x", n: 0 },
      }),
    ).rejects.toThrow(/roomId/);

    const missingN = await signDataObject(
      {
        semantic: { schema: ROOM_MESSAGE_SCHEMA },
        payload: { roomId: ROOM_ID, text: "no n" },
        governance: { purpose: ROOM_MESSAGE_PURPOSE, ttlSeconds: 3600 },
      },
      identity,
    );
    await expect(verifyRoomMessage(missingN)).rejects.toThrow(/non-negative integer/);

    const unknownAction = await signDataObject(
      {
        semantic: { schema: ROOM_MODERATION_SCHEMA },
        payload: {
          roomId: ROOM_ID,
          action: "shadowban",
          subjectDid: identity.did,
        },
        governance: { purpose: ROOM_MODERATION_PURPOSE, ttlSeconds: 3600 },
      },
      identity,
    );
    await expect(verifyRoomModeration(unknownAction)).rejects.toThrow(/Invalid moderation action/);

    const badJoined = await signDataObject(
      {
        semantic: { schema: ROOM_MEMBER_UPDATE_SCHEMA },
        payload: { roomId: ROOM_ID, joined: [identity.did, 42] },
        governance: { purpose: ROOM_MEMBER_UPDATE_PURPOSE, ttlSeconds: 3600 },
      },
      identity,
    );
    await expect(verifyRoomMemberUpdate(badJoined)).rejects.toThrow(/joined\[1\]/);

    const wrongSchema = await signDataObject(
      {
        semantic: { schema: ROOM_ACTIVITY_SCHEMA },
        payload: { roomId: ROOM_ID, text: "x", n: 0 },
        governance: { purpose: ROOM_MESSAGE_PURPOSE, ttlSeconds: 3600 },
      },
      identity,
    );
    await expect(verifyRoomMessage(wrongSchema)).rejects.toThrow(/Expected schema/);
  });

  it("verifyRoomObject rejects coordination:proposal", async () => {
    const identity = await generateAgentKeyPair();
    const proposal = await createSchedulingProposal({
      identity,
      payload: {
        title: "Sync",
        slots: [
          {
            id: "t1",
            label: "Tue",
            start: "2026-07-08T10:00:00.000Z",
            end: "2026-07-08T10:30:00.000Z",
          },
        ],
      },
    });
    await expect(verifyRoomObject(proposal)).rejects.toThrow();
    expect(proposal.governance.purpose).toBe(COORDINATION_PROPOSAL_PURPOSE);
  });

  it("expectedMlsSenderDid mismatch propagates as a throw", async () => {
    const alice = await generateAgentKeyPair();
    const bob = await generateAgentKeyPair();
    const message = await createRoomMessage({
      identity: alice,
      payload: { roomId: ROOM_ID, text: "bound", n: 0 },
    });
    await expect(
      verifyRoomObject(message, { expectedMlsSenderDid: bob.did }),
    ).rejects.toThrow(/does not match MLS sender/);
  });

  it("replay guard passthrough rejects a second verification", async () => {
    const identity = await generateAgentKeyPair();
    const message = await createRoomMessage({
      identity,
      payload: { roomId: ROOM_ID, text: "once", n: 0 },
    });
    const replay = new ReplayGuard();
    await expect(verifyRoomObject(message, { replay })).resolves.toMatchObject({
      purpose: ROOM_MESSAGE_PURPOSE,
    });
    await expect(verifyRoomObject(message, { replay })).rejects.toThrow(/replay/);
  });

  it("verifyRoomInvite rejects correct purpose with wrong schema", async () => {
    const identity = await generateAgentKeyPair();
    const invite = await signDataObject(
      {
        semantic: { schema: SCHEDULING_PROPOSAL_SCHEMA },
        payload: {
          roomId: ROOM_ID,
          hostUrl: "https://host.example",
          roomName: "Lounge",
        },
        governance: { purpose: ROOM_INVITE_PURPOSE, ttlSeconds: 3600 },
      },
      identity,
    );
    await expect(verifyRoomInvite(invite)).rejects.toThrow(/Expected schema/);

    const validInvite = await createRoomInvite({
      identity,
      payload: {
        roomId: ROOM_ID,
        hostUrl: "https://host.example",
        roomName: "Lounge",
      },
    });
    await expect(verifyRoomInvite(validInvite)).resolves.toMatchObject({
      payload: { roomName: "Lounge" },
    });
    expect(validInvite.semantic.schema).toBe(ROOM_INVITE_SCHEMA);
  });
});
