import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  ACTION_CAPTURE_PURPOSE,
  ACTION_CONFIRM_PURPOSE,
  ACTION_HOLD_PURPOSE,
  ACTION_RECEIPT_PURPOSE,
  ACTION_RELEASE_PURPOSE,
} from "./constants.js";
import {
  createActionCapture,
  createActionConfirm,
  createActionHold,
  createActionReceipt,
  createActionRelease,
  verifyActionCapture,
  verifyActionConfirm,
  verifyActionHold,
  verifyActionReceipt,
  verifyActionRelease,
} from "./transactions.js";

const amount = { currency: "EUR", amountMinor: 22000 };

describe("M11 transaction objects", () => {
  it("round-trips a hold linked to attestation", async () => {
    const identity = await generateAgentKeyPair();
    const hold = await createActionHold({
      identity,
      payload: {
        transactionId: "txn-1",
        railRef: "pi_123",
        rail: "stripe",
        amount,
        attestationRef: "attestation:4:abc123",
        label: "2 nights, Hotel Example",
        peerDid: "did:key:z6Mkpeer",
      },
    });
    const verified = await verifyActionHold(hold);
    expect(verified.object.governance.purpose).toBe(ACTION_HOLD_PURPOSE);
    expect(verified.payload.amount.amountMinor).toBe(22000);
    expect(verified.payload.rail).toBe("stripe");
  });

  it("round-trips a party confirm linked to hold", async () => {
    const identity = await generateAgentKeyPair();
    const confirm = await createActionConfirm({
      identity,
      payload: {
        transactionId: "txn-1",
        holdObjectId: "hold-obj-1",
        role: "payee",
        amount,
        attestationRef: "attestation:6:ghi789",
        label: "2 nights, Hotel Example",
      },
    });
    const verified = await verifyActionConfirm(confirm);
    expect(verified.object.governance.purpose).toBe(ACTION_CONFIRM_PURPOSE);
    expect(verified.payload.role).toBe("payee");
  });

  it("round-trips capture and receipt", async () => {
    const identity = await generateAgentKeyPair();
    const capture = await createActionCapture({
      identity,
      payload: {
        transactionId: "txn-1",
        railRef: "pi_123",
        amount,
        attestationRef: "attestation:5:def456",
      },
    });
    expect((await verifyActionCapture(capture)).object.governance.purpose).toBe(
      ACTION_CAPTURE_PURPOSE,
    );

    const receipt = await createActionReceipt({
      identity,
      payload: {
        transactionId: "txn-1",
        railRef: "pi_123",
        amount,
        attestationRef: "attestation:5:def456",
        capturedAt: new Date().toISOString(),
        label: "2 nights, Hotel Example",
      },
    });
    expect((await verifyActionReceipt(receipt)).object.governance.purpose).toBe(
      ACTION_RECEIPT_PURPOSE,
    );
  });

  it("round-trips a compensating release", async () => {
    const identity = await generateAgentKeyPair();
    const release = await createActionRelease({
      identity,
      payload: {
        transactionId: "txn-1",
        railRef: "pi_123",
        reason: "timeout",
        note: "Hold expired before counterpart confirm",
      },
    });
    const verified = await verifyActionRelease(release);
    expect(verified.object.governance.purpose).toBe(ACTION_RELEASE_PURPOSE);
    expect(verified.payload.reason).toBe("timeout");
  });

  it("rejects non-integer or non-positive amounts", async () => {
    const identity = await generateAgentKeyPair();
    await expect(
      createActionHold({
        identity,
        payload: {
          transactionId: "txn-2",
          railRef: "pi_9",
          rail: "stripe",
          amount: { currency: "EUR", amountMinor: 12.5 },
          attestationRef: "attestation:1:aaa",
        },
      }),
    ).rejects.toThrow(/amountMinor/);
    await expect(
      createActionHold({
        identity,
        payload: {
          transactionId: "txn-2",
          railRef: "pi_9",
          rail: "stripe",
          amount: { currency: "eur", amountMinor: 100 },
          attestationRef: "attestation:1:aaa",
        },
      }),
    ).rejects.toThrow(/currency/);
  });

  it("rejects purpose mismatch across object kinds", async () => {
    const identity = await generateAgentKeyPair();
    const hold = await createActionHold({
      identity,
      payload: {
        transactionId: "txn-3",
        railRef: "pi_7",
        rail: "stripe",
        amount,
        attestationRef: "attestation:2:bbb",
      },
    });
    await expect(verifyActionCapture(hold)).rejects.toThrow(/purpose/i);
  });
});
