import { describe, expect, it } from "vitest";
import { ATOM_MLS_HANDSHAKE_MEDIA_TYPE } from "./constants.js";
import { isAtomMlsHandshakeEnvelope } from "./mlsHandshake.js";

describe("AtomMlsHandshakeEnvelope shape (D135)", () => {
  it("accepts welcome + ratchetTree (pair / join)", () => {
    expect(
      isAtomMlsHandshakeEnvelope({
        mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
        initiatorDid: "did:key:zHost",
        welcome: "dGVzdA==",
        ratchetTree: "dGVzdA==",
      }),
    ).toBe(true);
  });

  it("accepts welcome + commit + memberDids (room add)", () => {
    expect(
      isAtomMlsHandshakeEnvelope({
        mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
        initiatorDid: "did:key:zHost",
        welcome: "dGVzdA==",
        commit: "Y29tbWl0",
        ratchetTree: "dGVzdA==",
        memberDids: ["did:key:zHost", "did:key:zMember"],
      }),
    ).toBe(true);
  });

  it("accepts commit-only (membership fan-out shape)", () => {
    expect(
      isAtomMlsHandshakeEnvelope({
        mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
        initiatorDid: "did:key:zHost",
        commit: "Y29tbWl0",
        ratchetTree: "dGVzdA==",
      }),
    ).toBe(true);
  });

  it("rejects missing both welcome and commit", () => {
    expect(
      isAtomMlsHandshakeEnvelope({
        mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
        initiatorDid: "did:key:zHost",
        ratchetTree: "dGVzdA==",
      }),
    ).toBe(false);
  });

  it("rejects non-string memberDids entries", () => {
    expect(
      isAtomMlsHandshakeEnvelope({
        mediaType: ATOM_MLS_HANDSHAKE_MEDIA_TYPE,
        initiatorDid: "did:key:zHost",
        welcome: "dGVzdA==",
        ratchetTree: "dGVzdA==",
        memberDids: ["did:key:zHost", 42],
      }),
    ).toBe(false);
  });
});
