import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { ACTION_ANCHOR_PURPOSE } from "./constants.js";
import { createActionHold } from "./transactions.js";
import {
  buildChannelEntry,
  channelIdForTransaction,
  computeChannelHeadHash,
  createActionAnchor,
  verifyActionAnchor,
} from "./disputeChannel.js";

describe("M11.7 dispute channel", () => {
  it("builds tamper-evident channel entries and head hash", async () => {
    const identity = await generateAgentKeyPair();
    const hold = await createActionHold({
      identity,
      payload: {
        transactionId: "txn-channel-1",
        railRef: "pi_abc",
        rail: "stripe",
        amount: { currency: "EUR", amountMinor: 5000 },
        attestationRef: "attestation:1:aaa",
      },
    });
    const entry = buildChannelEntry(hold, 0);
    expect(entry.kind).toBe("hold");
    expect(entry.objectHash).toMatch(/^[a-f0-9]{64}$/);
    const headHash = computeChannelHeadHash([entry]);
    expect(headHash).toMatch(/^[a-f0-9]{64}$/);
    expect(channelIdForTransaction("txn-channel-1")).toBe("txn:txn-channel-1");
  });

  it("round-trips a selective anchor object", async () => {
    const identity = await generateAgentKeyPair();
    const anchor = await createActionAnchor({
      identity,
      payload: {
        channelId: "txn:txn-channel-1",
        headSequence: 2,
        headHash: "abc123",
        entryCount: 3,
        note: "Pre-capture dispute checkpoint",
      },
    });
    const verified = await verifyActionAnchor(anchor);
    expect(verified.object.governance.purpose).toBe(ACTION_ANCHOR_PURPOSE);
    expect(verified.payload.entryCount).toBe(3);
  });
});
