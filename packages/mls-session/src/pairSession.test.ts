import { describe, expect, it } from "vitest";
import { establishPairSession, MlsPairSession } from "./pairSession.js";

describe("MlsPairSession", () => {
  it("establishes a pair session and exchanges encrypted messages", async () => {
    const { initiator, responder } = await establishPairSession({
      initiatorDid: "did:key:z6Mkinitiator",
      responderDid: "did:key:z6Mkresponder",
    });

    const plaintext = new TextEncoder().encode("atom mls payload");
    const wire = await initiator.encrypt(plaintext);
    const decrypted = await responder.decrypt(wire);
    expect(new TextDecoder().decode(decrypted)).toBe("atom mls payload");

    const reply = await responder.encrypt(new TextEncoder().encode("ack"));
    const gotReply = await initiator.decrypt(reply);
    expect(new TextDecoder().decode(gotReply)).toBe("ack");
  });
});
