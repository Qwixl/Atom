import { describe, expect, it } from "vitest";
import { generateGroupMemberKeyPackage, MlsGroupSession } from "./groupSession.js";

describe("MlsGroupSession snapshots", () => {
  it("restores host state and can add a member after snapshot round-trip", async () => {
    const hostDid = "did:key:coffee-host";
    const memberDid = "did:key:coffee-member";
    const roomId = "room:coffeeshop";

    const { session: host, publicPackage, privatePackage } = await MlsGroupSession.createHost({
      localDid: hostDid,
      roomId,
    });

    const snap = host.exportSnapshot();
    const restored = MlsGroupSession.restoreFromSnapshot(snap, { publicPackage, privatePackage });

    const memberKp = await generateGroupMemberKeyPackage(memberDid);
    const welcomeWire = await restored.addMember({
      memberDid,
      keyPackageWire: memberKp.keyPackageWire,
    });

    const memberSession = await MlsGroupSession.joinFromWelcome({
      localDid: memberDid,
      roomId,
      welcomeWire,
      publicPackage: memberKp.publicPackage,
      privatePackage: memberKp.privatePackage,
      ratchetTree: restored.ratchetTree(),
      memberDids: [hostDid, memberDid],
    });

    const wire = await restored.encrypt(new TextEncoder().encode(JSON.stringify({ kind: "message", text: "hi" })));
    const plaintext = await memberSession.decrypt(wire);
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as { text?: string };
    expect(parsed.text).toBe("hi");
  });
});
