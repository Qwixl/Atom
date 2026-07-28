import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { establishPairSession, MlsPairSession } from "./pairSession.js";

describe("MlsPairSession snapshots", () => {
  it("exports a versioned snapshot with group state", async () => {
    const initiator = await generateAgentKeyPair();
    const responder = await generateAgentKeyPair();
    const { initiator: initSession, responder: respSession } = await establishPairSession({
      initiator,
      responder,
    });

    const snap = initSession.exportSnapshot();
    expect(snap.version).toBe(1);
    expect(snap.localDid).toBe(initiator.did);
    expect(snap.peerDid).toBe(responder.did);
    expect(snap.groupStateB64.length).toBeGreaterThan(16);

    const wire = await initSession.encrypt(new TextEncoder().encode("live session"));
    const decrypted = await respSession.decrypt(wire);
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
