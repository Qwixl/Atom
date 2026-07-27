import { describe, expect, it } from "vitest";
import {
  generateAgentKeyPair,
  isExpired,
  isPurposeAllowed,
  publicKeyToDid,
  resolveExpiry,
  signDataObject,
  verifyDataObject,
  didToPublicKey,
} from "./index.js";

describe("did:key identity", () => {
  it("round-trips Ed25519 public keys", async () => {
    const keyPair = await generateAgentKeyPair();
    const recovered = didToPublicKey(keyPair.did);
    expect(recovered).toEqual(keyPair.publicKey);
    expect(publicKeyToDid(recovered)).toBe(keyPair.did);
  });
});

describe("data object envelope", () => {
  it("signs and verifies with purpose and TTL enforcement", async () => {
    const keyPair = await generateAgentKeyPair();
    const issuedAt = new Date().toISOString();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "Hello agent" },
        governance: { purpose: "comms:message", ttlSeconds: 3600 },
      },
      keyPair,
      { issuedAt },
    );

    const verified = await verifyDataObject(object, {
      allowedPurposes: ["comms:message"],
    });
    expect(verified.payload.text).toBe("Hello agent");
    expect(isPurposeAllowed(verified, ["comms:message"])).toBe(true);
    expect(isExpired(verified, new Date(Date.parse(issuedAt) + 30 * 60 * 1000))).toBe(
      false,
    );
  });

  it("rejects tampered payload", async () => {
    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "original" },
        governance: { purpose: "comms:message" },
      },
      keyPair,
    );
    const tampered = { ...object, payload: { text: "tampered" } };
    await expect(verifyDataObject(tampered)).rejects.toThrow(/signature/);
  });

  it("rejects disallowed purpose", async () => {
    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "secret" },
        governance: { purpose: "comms:message" },
      },
      keyPair,
    );
    await expect(
      verifyDataObject(object, { allowedPurposes: ["delivery:address"] }),
    ).rejects.toThrow(/purpose/);
  });

  it("rejects expired objects", async () => {
    const keyPair = await generateAgentKeyPair();
    const issuedAt = new Date(Date.now() - 10_000).toISOString();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "late" },
        governance: { purpose: "comms:message", ttlSeconds: 1 },
      },
      keyPair,
      { issuedAt },
    );
    await expect(verifyDataObject(object)).rejects.toThrow(/expired/);
  });

  it("takes the earlier of ttlSeconds and expiresAt", async () => {
    const keyPair = await generateAgentKeyPair();
    const issuedAt = new Date(Date.now() - 10_000).toISOString();
    const distantFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // A short TTL must not be extended by a distant absolute expiry.
    const shortTtl = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "short ttl wins" },
        governance: { purpose: "comms:message", ttlSeconds: 1, expiresAt: distantFuture },
      },
      keyPair,
      { issuedAt },
    );
    await expect(verifyDataObject(shortTtl)).rejects.toThrow(/expired/);

    // And the mirror: a past absolute expiry must not be extended by a long TTL.
    const pastAbsolute = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "past expiresAt wins" },
        governance: {
          purpose: "comms:message",
          ttlSeconds: 31_536_000,
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        },
      },
      keyPair,
      { issuedAt },
    );
    await expect(verifyDataObject(pastAbsolute)).rejects.toThrow(/expired/);
  });

  it("resolveExpiry returns the earlier instant", () => {
    const issuedAt = "2026-01-15T11:00:00.000Z";
    const earlierIsAbsolute = resolveExpiry(
      { purpose: "comms:message", ttlSeconds: 31_536_000, expiresAt: "2026-01-15T11:30:00.000Z" },
      issuedAt,
    );
    expect(earlierIsAbsolute?.toISOString()).toBe("2026-01-15T11:30:00.000Z");

    const earlierIsTtl = resolveExpiry(
      { purpose: "comms:message", ttlSeconds: 60, expiresAt: "2027-01-15T11:30:00.000Z" },
      issuedAt,
    );
    expect(earlierIsTtl?.toISOString()).toBe("2026-01-15T11:01:00.000Z");

    expect(resolveExpiry({ purpose: "comms:message" }, issuedAt)).toBeUndefined();
  });
});
