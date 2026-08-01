import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRoomMessage,
  createRoomMutation,
  roomObjectChainHash,
  verifyRoomReceipt,
} from "@qwixl/a2a-transport";
import { generateAgentKeyPair, ReplayGuard, type AgentKeyPair, type DataObject } from "@qwixl/protocol";
import {
  encodeLegacyRoomPayload,
  encodeRoomObject,
  type MlsSessionStore,
} from "./mlsSessions.js";
import { ATOM_BASE_ROOM_POLICY_URL, RoomStore, type RoomDescriptor } from "./roomStore.js";
import { handleInboundRoomWire, resetRoomChainTrackers } from "./roomsAdmin.js";

const DUMMY_WIRE = new Uint8Array([0xde, 0xad]);

function stubMlsStore(
  script: Array<{ plaintext: Uint8Array; senderDid: string }>,
  localIdentity?: AgentKeyPair,
): MlsSessionStore {
  let index = 0;
  return {
    decryptRoom: async (_roomId: string, _wire: Uint8Array) => {
      if (index >= script.length) {
        throw new Error("stubMlsStore: script exhausted");
      }
      return script[index++];
    },
    get localIdentity() {
      if (!localIdentity) {
        throw new Error("stubMlsStore: localIdentity required for host receipt minting");
      }
      return localIdentity;
    },
  } as unknown as MlsSessionStore;
}

async function deliverInbound(opts: {
  rooms: RoomStore;
  roomId: string;
  senderDid: string;
  plaintext: Uint8Array;
  localDid: string;
  hostIdentity?: AgentKeyPair;
  mlsSenderDid?: string;
  replayGuard?: ReplayGuard;
}): Promise<{ receipt?: DataObject }> {
  const mlsSenderDid = opts.mlsSenderDid ?? opts.senderDid;
  return handleInboundRoomWire({
    roomId: opts.roomId,
    senderDid: opts.senderDid,
    wire: DUMMY_WIRE,
    mlsStore: stubMlsStore(
      [{ plaintext: opts.plaintext, senderDid: mlsSenderDid }],
      opts.hostIdentity,
    ),
    rooms: opts.rooms,
    localDid: opts.localDid,
    replayGuard: opts.replayGuard,
  });
}

async function deliverObject(opts: {
  rooms: RoomStore;
  roomId: string;
  senderDid: string;
  object: DataObject;
  localDid: string;
  hostIdentity?: AgentKeyPair;
  mlsSenderDid?: string;
  replayGuard?: ReplayGuard;
}): Promise<{ receipt?: DataObject }> {
  return deliverInbound({
    ...opts,
    plaintext: encodeRoomObject(opts.object),
  });
}

function rememberJoinedRoom(rooms: RoomStore, hostDid: string): string {
  const roomId = `room:${randomUUID()}`;
  const descriptor: RoomDescriptor = {
    roomId,
    hostDid,
    name: "joined test room",
    category: "Town",
    admission: "open",
    status: "active",
    maxMembers: 64,
    createdAt: new Date().toISOString(),
    activities: [],
    rules: {
      basePolicyUrl: ATOM_BASE_ROOM_POLICY_URL,
      hostRules: [],
    },
  };
  rooms.rememberJoinedRoom({
    roomId,
    hostUrl: "http://example.invalid",
    descriptor,
  });
  return roomId;
}

describe("handleInboundRoomWire", () => {
  let dataDir: string;
  let prevDataDir: string | undefined;
  let rooms: RoomStore;

  beforeEach(async () => {
    resetRoomChainTrackers();
    prevDataDir = process.env.ATOM_DATA_DIR;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-room-"));
    process.env.ATOM_DATA_DIR = dataDir;
    rooms = new RoomStore();
    await rooms.load();
  });

  afterEach(async () => {
    // Mutators fire persistence without awaiting it, so tearing the directory
    // down first races the write and buries any genuine persist failure in
    // ENOENT noise.
    await rooms.flush();
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (prevDataDir === undefined) delete process.env.ATOM_DATA_DIR;
    else process.env.ATOM_DATA_DIR = prevDataDir;
  });

  describe("host path", () => {
    async function setupHostedRoom(): Promise<{
      host: AgentKeyPair;
      member: AgentKeyPair;
      roomId: string;
    }> {
      const host = await generateAgentKeyPair();
      const member = await generateAgentKeyPair();
      const descriptor = rooms.createRoom({
        hostDid: host.did,
        name: "hosted test room",
        admission: "open",
      });
      rooms.addMember(descriptor.roomId, { did: member.did });
      return { host, member, roomId: descriptor.roomId };
    }

    it("accepts a validly signed room:message from a member", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const object = await createRoomMessage({
        identity: member,
        payload: { roomId, text: "hello host", n: 0 },
      });

      const { receipt } = await deliverObject({
        rooms,
        roomId,
        senderDid: member.did,
        object,
        localDid: host.did,
        hostIdentity: host,
      });

      const messages = rooms.listMessages(roomId);
      const entry = messages.find((m) => m.object?.id === object.id);
      expect(entry).toBeDefined();
      expect(entry?.text).toBe("hello host");
      expect(receipt).toBeDefined();
      const verified = await verifyRoomReceipt(receipt!, {
        expectedHostDid: host.did,
        expectedRoomId: roomId,
        expectedObjectHash: roomObjectChainHash(object),
        expectedObjectId: object.id,
      });
      expect(verified.payload.seq).toBe(entry!.seq);
      expect(verified.payload.objectId).toBe(object.id);
    });

    it("rejects legacy unsigned payloads (anti-downgrade)", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const plaintext = encodeLegacyRoomPayload({
        kind: "message",
        text: "unsigned downgrade",
      });

      await expect(
        deliverInbound({
          rooms,
          roomId,
          senderDid: member.did,
          plaintext,
          localDid: host.did,
          hostIdentity: host,
        }),
      ).rejects.toThrow(/Unsigned room payloads are no longer accepted/);
    });

    it("rejects an object bound to a different roomId (cross-room replay)", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const otherRoomId = `room:${randomUUID()}`;
      const object = await createRoomMessage({
        identity: member,
        payload: { roomId: otherRoomId, text: "wrong room", n: 0 },
      });

      await expect(
        deliverObject({
          rooms,
          roomId,
          senderDid: member.did,
          object,
          localDid: host.did,
          hostIdentity: host,
        }),
      ).rejects.toThrow(/cross-room replay/);
    });

    it("rejects when MLS-reported senderDid differs from claimed senderDid", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const impostor = await generateAgentKeyPair();
      const object = await createRoomMessage({
        identity: member,
        payload: { roomId, text: "sender mismatch", n: 0 },
      });

      await expect(
        deliverObject({
          rooms,
          roomId,
          senderDid: member.did,
          object,
          localDid: host.did,
          hostIdentity: host,
          mlsSenderDid: impostor.did,
        }),
      ).rejects.toThrow(/does not match claimed sender/);
    });

    it("returns the same receipt on idempotent retry instead of rejecting as replay", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const replayGuard = new ReplayGuard();
      const object = await createRoomMessage({
        identity: member,
        payload: { roomId, text: "once only", n: 0 },
      });

      const first = await deliverObject({
        rooms,
        roomId,
        senderDid: member.did,
        object,
        localDid: host.did,
        hostIdentity: host,
        replayGuard,
      });
      const second = await deliverObject({
        rooms,
        roomId,
        senderDid: member.did,
        object,
        localDid: host.did,
        hostIdentity: host,
        replayGuard,
      });

      expect(second.receipt).toEqual(first.receipt);
      expect(rooms.listMessages(roomId).filter((m) => m.object?.id === object.id)).toHaveLength(1);
    });

    it("persists acceptance receipts across RoomStore reload", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const object = await createRoomMessage({
        identity: member,
        payload: { roomId, text: "durable receipt", n: 0 },
      });
      const first = await deliverObject({
        rooms,
        roomId,
        senderDid: member.did,
        object,
        localDid: host.did,
        hostIdentity: host,
      });
      await rooms.flush();

      const reloaded = new RoomStore();
      await reloaded.load();
      const stored = reloaded.getAcceptanceReceipt(roomId, object.id);
      expect(stored?.receipt).toEqual(first.receipt);

      const retry = await deliverObject({
        rooms: reloaded,
        roomId,
        senderDid: member.did,
        object,
        localDid: host.did,
        hostIdentity: host,
        replayGuard: new ReplayGuard(),
      });
      expect(retry.receipt).toEqual(first.receipt);
      expect(reloaded.listMessages(roomId).filter((m) => m.object?.id === object.id)).toHaveLength(
        1,
      );
    });

    it("rejects a muted sender without minting a receipt", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const room = rooms.getRoom(roomId)!;
      const roster = room.members.find((m) => m.did === member.did)!;
      roster.mutedUntil = Date.now() + 60_000;
      const object = await createRoomMessage({
        identity: member,
        payload: { roomId, text: "muted", n: 0 },
      });

      await expect(
        deliverObject({
          rooms,
          roomId,
          senderDid: member.did,
          object,
          localDid: host.did,
          hostIdentity: host,
        }),
      ).rejects.toThrow(/muted/);
      expect(rooms.getAcceptanceReceipt(roomId, object.id)).toBeUndefined();
      expect(rooms.listMessages(roomId).some((m) => m.object?.id === object.id)).toBe(false);
    });

    it("rejects a sender who is not on the room roster", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const outsider = await generateAgentKeyPair();
      const object = await createRoomMessage({
        identity: outsider,
        payload: { roomId, text: "not a member", n: 0 },
      });

      await expect(
        deliverObject({
          rooms,
          roomId,
          senderDid: outsider.did,
          object,
          localDid: host.did,
          hostIdentity: host,
        }),
      ).rejects.toThrow(/not a room member/);
    });

    it("rejects a room:mutation by a non-author targeting another member's message", async () => {
      const { host, member, roomId } = await setupHostedRoom();
      const otherMember = await generateAgentKeyPair();
      rooms.addMember(roomId, { did: otherMember.did });

      const message = await createRoomMessage({
        identity: member,
        payload: { roomId, text: "original text", n: 0 },
      });
      await deliverObject({
        rooms,
        roomId,
        senderDid: member.did,
        object: message,
        localDid: host.did,
        hostIdentity: host,
      });

      const mutation = await createRoomMutation({
        identity: otherMember,
        payload: {
          roomId,
          action: "edit",
          targetObjectId: message.id,
          text: "stolen edit",
          n: 0,
          prevHash: roomObjectChainHash(message),
        },
      });

      await expect(
        deliverObject({
          rooms,
          roomId,
          senderDid: otherMember.did,
          object: mutation,
          localDid: host.did,
          hostIdentity: host,
        }),
      ).rejects.toThrow(/Only the author/);
    });

    it("accepts a room:mutation by the original author and updates the target message", async () => {
      const { host, member, roomId } = await setupHostedRoom();

      const message = await createRoomMessage({
        identity: member,
        payload: { roomId, text: "before edit", n: 0 },
      });
      await deliverObject({
        rooms,
        roomId,
        senderDid: member.did,
        object: message,
        localDid: host.did,
        hostIdentity: host,
      });

      const mutation = await createRoomMutation({
        identity: member,
        payload: {
          roomId,
          action: "edit",
          targetObjectId: message.id,
          text: "after edit",
          n: 1,
          prevHash: roomObjectChainHash(message),
        },
      });
      await deliverObject({
        rooms,
        roomId,
        senderDid: member.did,
        object: mutation,
        localDid: host.did,
        hostIdentity: host,
      });

      const target = rooms.listMessages(roomId).find((m) => m.object?.id === message.id);
      expect(target?.text).toBe("after edit");
    });
  });

  describe("member path", () => {
    it("accepts in-order chain arrivals with continuity ok and tracks recv at n=2", async () => {
      const local = await generateAgentKeyPair();
      const sender = await generateAgentKeyPair();
      const hostDid = (await generateAgentKeyPair()).did;
      const roomId = rememberJoinedRoom(rooms, hostDid);

      const msg0 = await createRoomMessage({
        identity: sender,
        payload: { roomId, text: "n0", n: 0 },
      });
      const msg1 = await createRoomMessage({
        identity: sender,
        payload: {
          roomId,
          text: "n1",
          n: 1,
          prevHash: roomObjectChainHash(msg0),
        },
      });
      const msg2 = await createRoomMessage({
        identity: sender,
        payload: {
          roomId,
          text: "n2",
          n: 2,
          prevHash: roomObjectChainHash(msg1),
        },
      });

      for (const object of [msg0, msg1, msg2]) {
        await deliverObject({
          rooms,
          roomId,
          senderDid: sender.did,
          object,
          localDid: local.did,
        });
      }

      const transcript = rooms.listJoinedMessages(roomId);
      expect(transcript).toHaveLength(3);
      expect(transcript.every((entry) => entry.continuity === "ok")).toBe(true);

      const recv = rooms.chainState(roomId).recv.find((r) => r.senderDid === sender.did);
      expect(recv).toEqual({ senderDid: sender.did, n: 2, hash: roomObjectChainHash(msg2) });
    });

    it("buffers out-of-order arrivals as pending then upgrades to ok when the gap fills", async () => {
      const local = await generateAgentKeyPair();
      const sender = await generateAgentKeyPair();
      const hostDid = (await generateAgentKeyPair()).did;
      const roomId = rememberJoinedRoom(rooms, hostDid);

      const msg0 = await createRoomMessage({
        identity: sender,
        payload: { roomId, text: "n0", n: 0 },
      });
      const msg1 = await createRoomMessage({
        identity: sender,
        payload: {
          roomId,
          text: "n1",
          n: 1,
          prevHash: roomObjectChainHash(msg0),
        },
      });
      const msg2 = await createRoomMessage({
        identity: sender,
        payload: {
          roomId,
          text: "n2",
          n: 2,
          prevHash: roomObjectChainHash(msg1),
        },
      });

      await deliverObject({
        rooms,
        roomId,
        senderDid: sender.did,
        object: msg0,
        localDid: local.did,
      });
      await deliverObject({
        rooms,
        roomId,
        senderDid: sender.did,
        object: msg2,
        localDid: local.did,
      });

      const afterGap = rooms.listJoinedMessages(roomId);
      expect(afterGap).toHaveLength(2);
      const pendingEntry = afterGap.find((entry) => entry.objectId === msg2.id);
      expect(pendingEntry?.continuity).toBe("pending");

      await deliverObject({
        rooms,
        roomId,
        senderDid: sender.did,
        object: msg1,
        localDid: local.did,
      });

      const transcript = rooms.listJoinedMessages(roomId);
      expect(transcript).toHaveLength(3);
      expect(transcript.every((entry) => entry.continuity === "ok")).toBe(true);
      expect(transcript.find((entry) => entry.objectId === msg2.id)?.continuity).toBe("ok");
    });

    it("records a fork when two different objects claim the same chain position", async () => {
      const local = await generateAgentKeyPair();
      const sender = await generateAgentKeyPair();
      const hostDid = (await generateAgentKeyPair()).did;
      const roomId = rememberJoinedRoom(rooms, hostDid);

      const msg0 = await createRoomMessage({
        identity: sender,
        payload: { roomId, text: "n0", n: 0 },
      });
      const msg1a = await createRoomMessage({
        identity: sender,
        payload: {
          roomId,
          text: "n1a",
          n: 1,
          prevHash: roomObjectChainHash(msg0),
        },
      });
      const msg1b = await createRoomMessage({
        identity: sender,
        payload: {
          roomId,
          text: "n1b",
          n: 1,
          prevHash: roomObjectChainHash(msg0),
        },
      });

      await deliverObject({
        rooms,
        roomId,
        senderDid: sender.did,
        object: msg0,
        localDid: local.did,
      });
      await deliverObject({
        rooms,
        roomId,
        senderDid: sender.did,
        object: msg1a,
        localDid: local.did,
      });
      await deliverObject({
        rooms,
        roomId,
        senderDid: sender.did,
        object: msg1b,
        localDid: local.did,
      });

      const transcript = rooms.listJoinedMessages(roomId);
      const forkEntry = transcript.find((entry) => entry.objectId === msg1b.id);
      expect(forkEntry?.continuity).toBe("fork");
    });

    it("does not add a duplicate transcript entry on re-delivery of an accepted object", async () => {
      const local = await generateAgentKeyPair();
      const sender = await generateAgentKeyPair();
      const hostDid = (await generateAgentKeyPair()).did;
      const roomId = rememberJoinedRoom(rooms, hostDid);

      const msg0 = await createRoomMessage({
        identity: sender,
        payload: { roomId, text: "once", n: 0 },
      });

      await deliverObject({
        rooms,
        roomId,
        senderDid: sender.did,
        object: msg0,
        localDid: local.did,
      });
      await deliverObject({
        rooms,
        roomId,
        senderDid: sender.did,
        object: msg0,
        localDid: local.did,
      });

      expect(rooms.listJoinedMessages(roomId)).toHaveLength(1);
    });
  });
});
