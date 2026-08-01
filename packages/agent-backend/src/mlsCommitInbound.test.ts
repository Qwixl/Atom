import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { generateGroupMemberKeyPackage } from "@qwixl/mls-session";
import { MlsSessionStore } from "./mlsSessions.js";
import { handleInboundRoomWire, resetRoomChainTrackers } from "./roomsAdmin.js";
import { RoomStore } from "./roomStore.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("inbound MLS public commit (D135)", () => {
  it("processRoomCommit via handleInboundRoomWire advances epoch", async () => {
    resetRoomChainTrackers();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atom-mls-commit-"));
    try {
      const host = await generateAgentKeyPair();
      const m1 = await generateAgentKeyPair();
      const m2 = await generateAgentKeyPair();
      const rooms = new RoomStore(path.join(dir, "rooms.json"));
      const roomId = "room:commit-fanout";
      rooms.createRoom({
        hostDid: host.did,
        name: "Commit Fan-out",
        roomId,
        acceptedBaseRules: true,
        hostEndpoint: "http://127.0.0.1:9/a2a/jsonrpc",
      });
      rooms.addMember(roomId, { did: m1.did, endpoint: "http://127.0.0.1:9/a2a/jsonrpc" });

      const hostStore = new MlsSessionStore(host);
      await hostStore.createRoomHost({ roomId });
      const kp1 = await generateGroupMemberKeyPackage(m1);
      const add1 = await hostStore.addRoomMember({
        roomId,
        memberDid: m1.did,
        keyPackageWire: kp1.keyPackageWire,
      });
      const memberStore = new MlsSessionStore(m1);
      await memberStore.joinRoom({
        roomId,
        handshake: add1,
        memberPackages: {
          publicPackage: kp1.publicPackage,
          privatePackage: kp1.privatePackage,
        },
      });

      const kp2 = await generateGroupMemberKeyPackage(m2);
      const add2 = await hostStore.addRoomMember({
        roomId,
        memberDid: m2.did,
        keyPackageWire: kp2.keyPackageWire,
      });

      await handleInboundRoomWire({
        roomId,
        senderDid: host.did,
        wire: add2.commitWire,
        mlsStore: memberStore,
        rooms,
        localDid: m1.did,
      });

      const wire = await hostStore.encryptRoom(roomId, new TextEncoder().encode("n3-ok"));
      const { plaintext } = await memberStore.decryptRoom(roomId, wire);
      expect(new TextDecoder().decode(plaintext)).toBe("n3-ok");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
