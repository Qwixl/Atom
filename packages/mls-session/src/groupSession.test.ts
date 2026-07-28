import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { generateGroupMemberKeyPackage, MlsGroupSession } from "./groupSession.js";

describe("MlsGroupSession snapshots", () => {
  it("restores host state and can add a member after snapshot round-trip", async () => {
    const host = await generateAgentKeyPair();
    const member = await generateAgentKeyPair();
    const roomId = "room:coffeeshop";

    const { session: hostSession, publicPackage, privatePackage } =
      await MlsGroupSession.createHost({
        identity: host,
        roomId,
      });

    const snap = hostSession.exportSnapshot();
    const restored = MlsGroupSession.restoreFromSnapshot(snap, {
      publicPackage,
      privatePackage,
    });

    const memberKp = await generateGroupMemberKeyPackage(member);
    const welcomeWire = await restored.addMember({
      memberDid: member.did,
      keyPackageWire: memberKp.keyPackageWire,
    });

    const memberSession = await MlsGroupSession.joinFromWelcome({
      localDid: member.did,
      roomId,
      welcomeWire,
      publicPackage: memberKp.publicPackage,
      privatePackage: memberKp.privatePackage,
      ratchetTree: restored.ratchetTree(),
      memberDids: [host.did, member.did],
    });

    const wire = await restored.encrypt(
      new TextEncoder().encode(JSON.stringify({ kind: "message", text: "hi" })),
    );
    const plaintext = await memberSession.decrypt(wire);
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as { text?: string };
    expect(parsed.text).toBe("hi");
  });
});
