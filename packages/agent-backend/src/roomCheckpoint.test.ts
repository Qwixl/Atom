import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRoomMessage,
  roomObjectChainHash,
  verifyRoomCheckpoint,
  checkpointOverlapVerdict,
} from "@qwixl/a2a-transport";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  buildCheckpointEntries,
  compareCheckpointToLocal,
  mintRoomCheckpoint,
} from "./roomCheckpoint.js";
import { RoomStore } from "./roomStore.js";

describe("room checkpoints (RI-06)", () => {
  let dataDir: string;
  let prevDataDir: string | undefined;
  let rooms: RoomStore;

  beforeEach(async () => {
    prevDataDir = process.env.ATOM_DATA_DIR;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-ckpt-"));
    process.env.ATOM_DATA_DIR = dataDir;
    rooms = new RoomStore();
    await rooms.load();
  });

  afterEach(async () => {
    await rooms.flush().catch(() => undefined);
    fs.rmSync(dataDir, { recursive: true, force: true });
    if (prevDataDir === undefined) delete process.env.ATOM_DATA_DIR;
    else process.env.ATOM_DATA_DIR = prevDataDir;
  });

  it("mints a durable contiguous checkpoint and remints idempotently", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const roomId = rooms.createRoom({
      hostDid: host.did,
      name: "ckpt",
      admission: "open",
      roomId: `room:${randomUUID()}`,
    }).roomId;
    rooms.addMember(roomId, { did: member.did });

    const a = await createRoomMessage({
      identity: member,
      payload: { roomId, text: "one", n: 0 },
    });
    const b = await createRoomMessage({
      identity: member,
      payload: { roomId, text: "two", n: 1, prevHash: roomObjectChainHash(a) },
    });
    rooms.appendMessage(roomId, {
      senderDid: member.did,
      kind: "message",
      text: "one",
      object: a,
    });
    rooms.appendMessage(roomId, {
      senderDid: member.did,
      kind: "message",
      text: "two",
      object: b,
    });

    const first = await mintRoomCheckpoint({
      rooms,
      roomId,
      fromSeq: 1,
      toSeq: 2,
      identity: host,
    });
    const second = await mintRoomCheckpoint({
      rooms,
      roomId,
      fromSeq: 1,
      toSeq: 2,
      identity: host,
    });
    expect(second).toEqual(first);

    await rooms.flush();
    const reloaded = new RoomStore();
    await reloaded.load();
    const stored = reloaded.findCheckpoint(roomId, 1, 2);
    expect(stored?.checkpoint).toEqual(first);
    await verifyRoomCheckpoint(first, {
      expectedHostDid: host.did,
      expectedRoomId: roomId,
    });
  });

  it("rejects ranges that include unsigned leave/ban rows", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const roomId = rooms.createRoom({
      hostDid: host.did,
      name: "ckpt-unsigned",
      admission: "open",
    }).roomId;
    rooms.addMember(roomId, { did: member.did });
    const a = await createRoomMessage({
      identity: member,
      payload: { roomId, text: "signed", n: 0 },
    });
    rooms.appendMessage(roomId, {
      senderDid: member.did,
      kind: "message",
      text: "signed",
      object: a,
    });
    rooms.appendMessage(roomId, {
      senderDid: host.did,
      kind: "activity",
      activityKind: "leave",
      payload: { memberDid: member.did },
    });
    expect(() => buildCheckpointEntries(rooms, roomId, 1, 2)).toThrow(/unsigned seq/);
  });

  it("classifies receipt mismatch under a covering checkpoint as contradict", async () => {
    const payload = {
      roomId: "room:x",
      fromSeq: 1,
      toSeq: 1,
      entries: [{ seq: 1, objectHash: "hash-a" }],
    };
    expect(
      compareCheckpointToLocal({
        payload,
        localBySeq: new Map(),
        receipts: [
          {
            objectId: "obj",
            objectHash: "hash-b",
            seq: 1,
            receipt: {} as never,
          },
        ],
      }),
    ).toBe("contradict");
    expect(
      compareCheckpointToLocal({
        payload,
        localBySeq: new Map(),
        receipts: [],
      }),
    ).toBe("incomplete");
  });

  it("requires full-range local/receipt coverage for agree", () => {
    const payload = {
      roomId: "room:x",
      fromSeq: 1,
      toSeq: 3,
      entries: [
        { seq: 1, objectHash: "h1" },
        { seq: 2, objectHash: "h2" },
        { seq: 3, objectHash: "h3" },
      ],
    };
    expect(
      compareCheckpointToLocal({
        payload,
        localBySeq: new Map([[1, { objectHash: "h1" }]]),
      }),
    ).toBe("incomplete");
    expect(
      compareCheckpointToLocal({
        payload,
        localBySeq: new Map([
          [1, { objectHash: "h1" }],
          [2, { objectHash: "h2" }],
          [3, { objectHash: "h3" }],
        ]),
      }),
    ).toBe("agree");
  });

  it("rejects remint of the same range after hash change", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const roomId = rooms.createRoom({
      hostDid: host.did,
      name: "ckpt-conflict",
      admission: "open",
    }).roomId;
    rooms.addMember(roomId, { did: member.did });
    const a = await createRoomMessage({
      identity: member,
      payload: { roomId, text: "one", n: 0 },
    });
    rooms.appendMessage(roomId, {
      senderDid: member.did,
      kind: "message",
      text: "one",
      object: a,
    });
    await mintRoomCheckpoint({ rooms, roomId, fromSeq: 1, toSeq: 1, identity: host });
    const replacement = await createRoomMessage({
      identity: member,
      payload: { roomId, text: "mutated", n: 0 },
    });
    const message = rooms.getMessage(roomId, 1)!;
    message.object = replacement;
    await expect(
      mintRoomCheckpoint({ rooms, roomId, fromSeq: 1, toSeq: 1, identity: host }),
    ).rejects.toThrow(/different hashes/);
  });

  it("exposes overlap helper for contradictory remints", () => {
    expect(
      checkpointOverlapVerdict(
        {
          roomId: "room:x",
          fromSeq: 1,
          toSeq: 2,
          entries: [
            { seq: 1, objectHash: "a" },
            { seq: 2, objectHash: "b" },
          ],
        },
        {
          roomId: "room:x",
          fromSeq: 2,
          toSeq: 2,
          entries: [{ seq: 2, objectHash: "Z" }],
        },
      ),
    ).toBe("contradict");
  });
});
