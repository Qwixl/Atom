import { describe, expect, it } from "vitest";
import {
  buildCommerceReceiptUpsert,
  parseAttestationRef,
  verifyAttestationCrossRef,
} from "./commerceReceipt.js";

describe("commerce receipt records", () => {
  it("parses attestation refs from transaction objects", () => {
    expect(parseAttestationRef("attestation:4:abc123def456")).toEqual({
      seq: 4,
      hashPrefix: "abc123def456",
    });
    expect(parseAttestationRef("invalid")).toBeNull();
  });

  it("cross-references capture attestation to shell log", () => {
    const entries = [{ seq: 4, hash: "abc123def4567890deadbeef" }];
    expect(verifyAttestationCrossRef("attestation:4:abc123", entries)).toEqual({
      verified: true,
      seq: 4,
    });
    expect(verifyAttestationCrossRef("attestation:4:ffff", entries).verified).toBe(false);
  });

  it("builds guarded owner-store upsert from receipt payload", () => {
    const upsert = buildCommerceReceiptUpsert({
      transactionId: "txn-1",
      receiptObjectId: "obj-1",
      railRef: "pi_1",
      amount: { currency: "EUR", amountMinor: 5000 },
      attestationRef: "attestation:2:deadbeef",
      attestationEntries: [{ seq: 2, hash: "deadbeefcafe" }],
      capturedAt: "2026-07-04T01:00:00.000Z",
      peerDid: "did:key:z6Mkpeer",
      label: "Hotel stay",
    });
    expect(upsert.category).toBe("commerce-receipts");
    expect(upsert.guarded).toBe(true);
    expect(upsert.value.attestationVerified).toBe(true);
    expect(upsert.id).toBe("receipt-txn-1");
  });
});
