import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { generateGroupMemberKeyPackage, MlsGroupSession } from "./groupSession.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function threeMemberRoom() {
  const host = await generateAgentKeyPair();
  const m1 = await generateAgentKeyPair();
  const m2 = await generateAgentKeyPair();
  const roomId = "room:n3";
  const { session: hostSession, publicPackage, privatePackage } =
    await MlsGroupSession.createHost({ identity: host, roomId });

  const kp1 = await generateGroupMemberKeyPackage(m1);
  const add1 = await hostSession.addMember({
    memberDid: m1.did,
    keyPackageWire: kp1.keyPackageWire,
  });
  const member1 = await MlsGroupSession.joinFromWelcome({
    localDid: m1.did,
    roomId,
    welcomeWire: add1.welcomeWire!,
    publicPackage: kp1.publicPackage,
    privatePackage: kp1.privatePackage,
    ratchetTree: hostSession.ratchetTree(),
    memberDids: add1.memberDids,
  });

  const kp2 = await generateGroupMemberKeyPackage(m2);
  const add2 = await hostSession.addMember({
    memberDid: m2.did,
    keyPackageWire: kp2.keyPackageWire,
  });
  await member1.processCommit(add2.commitWire);
  const member2 = await MlsGroupSession.joinFromWelcome({
    localDid: m2.did,
    roomId,
    welcomeWire: add2.welcomeWire!,
    publicPackage: kp2.publicPackage,
    privatePackage: kp2.privatePackage,
    ratchetTree: hostSession.ratchetTree(),
    memberDids: add2.memberDids,
  });

  return {
    host,
    m1,
    m2,
    roomId,
    hostSession,
    member1,
    member2,
    hostPackages: { publicPackage, privatePackage },
    m1Packages: { publicPackage: kp1.publicPackage, privatePackage: kp1.privatePackage },
    m2Packages: { publicPackage: kp2.publicPackage, privatePackage: kp2.privatePackage },
  };
}

describe("MLS-01 group persistence / fan-out (D135)", () => {
  it("N≥3 live: all members decrypt after second add (commit fan-out)", async () => {
    const { host, hostSession, member1, member2 } = await threeMemberRoom();
    const wire = await hostSession.encrypt(enc.encode("hello-n3"));
    const fromM1 = await member1.decrypt(wire);
    expect(fromM1.senderDid).toBe(host.did);
    expect(dec.decode(fromM1.plaintext)).toBe("hello-n3");
    expect(dec.decode((await member2.decrypt(wire)).plaintext)).toBe("hello-n3");
  });

  it("N≥3 post-traffic snapshot → restore → encrypt/decrypt", async () => {
    const ctx = await threeMemberRoom();
    const warm = await ctx.hostSession.encrypt(enc.encode("warm"));
    await ctx.member1.decrypt(warm);
    await ctx.member2.decrypt(warm);

    const hostRestored = MlsGroupSession.restoreFromSnapshot(
      ctx.hostSession.exportSnapshot(),
      ctx.hostPackages,
    );
    const m1Restored = MlsGroupSession.restoreFromSnapshot(
      ctx.member1.exportSnapshot(),
      ctx.m1Packages,
    );
    const m2Restored = MlsGroupSession.restoreFromSnapshot(
      ctx.member2.exportSnapshot(),
      ctx.m2Packages,
    );

    const wire = await hostRestored.encrypt(enc.encode("after-restart"));
    expect(dec.decode((await m1Restored.decrypt(wire)).plaintext)).toBe("after-restart");
    expect(dec.decode((await m2Restored.decrypt(wire)).plaintext)).toBe("after-restart");
  });

  it("remove member + remaining members process commit and continue", async () => {
    const ctx = await threeMemberRoom();
    const removed = await ctx.hostSession.removeMember({ memberDid: ctx.m1.did });
    expect(removed.memberDids).not.toContain(ctx.m1.did);
    await ctx.member2.processCommit(removed.commitWire);

    const wire = await ctx.hostSession.encrypt(enc.encode("after-remove"));
    expect(dec.decode((await ctx.member2.decrypt(wire)).plaintext)).toBe("after-remove");
    await expect(ctx.member1.decrypt(wire)).rejects.toThrow();
  });

  it("corrupted snapshot throws on restore", () => {
    const snap = {
      version: 1 as const,
      localDid: "did:key:x",
      roomId: "room:x",
      memberDids: ["did:key:x"],
      groupStateB64: "not-valid-base64-!!!!",
      ratchetTreeB64: "AAAA",
    };
    expect(() =>
      MlsGroupSession.restoreFromSnapshot(snap, {
        publicPackage: {} as never,
        privatePackage: {} as never,
      }),
    ).toThrow();
  });

  it("remove + restart: remaining members restore and continue", async () => {
    const ctx = await threeMemberRoom();
    const removed = await ctx.hostSession.removeMember({ memberDid: ctx.m1.did });
    await ctx.member2.processCommit(removed.commitWire);

    const hostRestored = MlsGroupSession.restoreFromSnapshot(
      ctx.hostSession.exportSnapshot(),
      ctx.hostPackages,
    );
    const m2Restored = MlsGroupSession.restoreFromSnapshot(
      ctx.member2.exportSnapshot(),
      ctx.m2Packages,
    );
    const wire = await hostRestored.encrypt(enc.encode("post-remove-restart"));
    expect(dec.decode((await m2Restored.decrypt(wire)).plaintext)).toBe("post-remove-restart");
  });

  it("stale commit rejected without advancing epoch", async () => {
    const ctx = await threeMemberRoom();
    const removed = await ctx.hostSession.removeMember({ memberDid: ctx.m1.did });
    await ctx.member2.processCommit(removed.commitWire);
    const epochBefore = ctx.member2.memberDids.length;
    await expect(ctx.member2.processCommit(removed.commitWire)).rejects.toThrow();
    expect(ctx.member2.memberDids.length).toBe(epochBefore);
  });

  it("legacy snapshot without ratchetTreeB64 restores via encodeGroupState fallback", async () => {
    const { encodeGroupState } = await import("ts-mls/clientState.js");
    const { bytesToBase64 } = await import("./pairSession.js");
    const host = await generateAgentKeyPair();
    const m1 = await generateAgentKeyPair();
    const kp1 = await generateGroupMemberKeyPackage(m1);
    const created = await MlsGroupSession.createHost({ identity: host, roomId: "room:legacy" });
    const add = await created.session.addMember({
      memberDid: m1.did,
      keyPackageWire: kp1.keyPackageWire,
    });
    const peer = await MlsGroupSession.joinFromWelcome({
      localDid: m1.did,
      roomId: "room:legacy",
      welcomeWire: add.welcomeWire!,
      publicPackage: kp1.publicPackage,
      privatePackage: kp1.privatePackage,
      ratchetTree: created.session.ratchetTree(),
      memberDids: add.memberDids,
    });
    const warm = await created.session.encrypt(enc.encode("warm"));
    await peer.decrypt(warm);
    const groupState = (created.session as unknown as { groupState: unknown }).groupState;
    const legacyHost = {
      version: 1 as const,
      localDid: host.did,
      roomId: "room:legacy",
      memberDids: [...created.session.memberDids],
      groupStateB64: bytesToBase64(encodeGroupState(groupState as never)),
    };
    expect("ratchetTreeB64" in legacyHost).toBe(false);
    const hostRestored = MlsGroupSession.restoreFromSnapshot(legacyHost, {
      publicPackage: created.publicPackage,
      privatePackage: created.privatePackage,
    });
    const peerRestored = MlsGroupSession.restoreFromSnapshot(peer.exportSnapshot(), {
      publicPackage: kp1.publicPackage,
      privatePackage: kp1.privatePackage,
    });
    const after = await hostRestored.encrypt(enc.encode("legacy-roundtrip"));
    expect(dec.decode((await peerRestored.decrypt(after)).plaintext)).toBe("legacy-roundtrip");
  });

  it("add member after host restart (N≥3)", async () => {
    const ctx = await threeMemberRoom();
    const warm = await ctx.hostSession.encrypt(enc.encode("warm"));
    await ctx.member1.decrypt(warm);
    await ctx.member2.decrypt(warm);
    const hostRestored = MlsGroupSession.restoreFromSnapshot(
      ctx.hostSession.exportSnapshot(),
      ctx.hostPackages,
    );
    const m3 = await generateAgentKeyPair();
    const kp3 = await generateGroupMemberKeyPackage(m3);
    const add3 = await hostRestored.addMember({
      memberDid: m3.did,
      keyPackageWire: kp3.keyPackageWire,
    });
    const m1Restored = MlsGroupSession.restoreFromSnapshot(
      ctx.member1.exportSnapshot(),
      ctx.m1Packages,
    );
    await m1Restored.processCommit(add3.commitWire);
    const m2Restored = MlsGroupSession.restoreFromSnapshot(
      ctx.member2.exportSnapshot(),
      ctx.m2Packages,
    );
    await m2Restored.processCommit(add3.commitWire);
    const member3 = await MlsGroupSession.joinFromWelcome({
      localDid: m3.did,
      roomId: ctx.roomId,
      welcomeWire: add3.welcomeWire!,
      publicPackage: kp3.publicPackage,
      privatePackage: kp3.privatePackage,
      ratchetTree: hostRestored.ratchetTree(),
      memberDids: add3.memberDids,
    });
    const wire = await hostRestored.encrypt(enc.encode("after-host-restart-add"));
    expect(dec.decode((await m1Restored.decrypt(wire)).plaintext)).toBe("after-host-restart-add");
    expect(dec.decode((await m2Restored.decrypt(wire)).plaintext)).toBe("after-host-restart-add");
    expect(dec.decode((await member3.decrypt(wire)).plaintext)).toBe("after-host-restart-add");
  });

  it("replay of same application message fails on second decrypt", async () => {
    const { hostSession, member1 } = await threeMemberRoom();
    const wire = await hostSession.encrypt(enc.encode("once"));
    await member1.decrypt(wire);
    await expect(member1.decrypt(wire)).rejects.toThrow();
  });
});
