import { describe, expect, it } from "vitest";
import { establishPairSession, MlsPairSession } from "./pairSession.js";

describe("MlsPairSession snapshots", () => {
  it("exports a versioned snapshot with group state", async () => {
    const { initiator, responder } = await establishPairSession({
      initiatorDid: "did:key:snap-init",
      responderDid: "did:key:snap-resp",
    });

    const snap = initiator.exportSnapshot();
    expect(snap.version).toBe(1);
    expect(snap.localDid).toBe("did:key:snap-init");
    expect(snap.peerDid).toBe("did:key:snap-resp");
    expect(snap.groupStateB64.length).toBeGreaterThan(16);

    const wire = await initiator.encrypt(new TextEncoder().encode("live session"));
    const decrypted = await responder.decrypt(wire);
    expect(new TextDecoder().decode(decrypted)).toBe("live session");

    expect(() =>
      MlsPairSession.restoreFromSnapshot(
        { ...snap, version: 99 as 1 },
        {
          publicPackage: {} as never,
          privatePackage: {} as never,
        },
      ),
    ).toThrow(/Unsupported MLS pair snapshot version/);
  });
});
