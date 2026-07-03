import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import { ACTION_RESERVE_PURPOSE } from "./constants.js";
import { createActionReserve, verifyActionReserve } from "./actions.js";

describe("action:reserve data object", () => {
  it("round-trips a scheduling slot reserve linked to attestation", async () => {
    const identity = await generateAgentKeyPair();
    const reserve = await createActionReserve({
      identity,
      payload: {
        refId: "tue-10",
        refKind: "scheduling-slot",
        attestationRef: "attestation:0:abc123def4567890",
        subjectId: "proposal-uuid",
        label: "Tue · 10:00–10:30",
        start: "2026-07-08T10:00:00.000Z",
        end: "2026-07-08T10:30:00.000Z",
        peerDid: "did:key:z6Mkexample",
      },
    });
    const verified = await verifyActionReserve(reserve);
    expect(verified.object.governance.purpose).toBe(ACTION_RESERVE_PURPOSE);
    expect(verified.payload.refKind).toBe("scheduling-slot");
    expect(verified.payload.attestationRef).toContain("attestation:");
  });

  it("rejects missing attestationRef", async () => {
    const identity = await generateAgentKeyPair();
    await expect(
      createActionReserve({
        identity,
        payload: {
          refId: "slot-1",
          refKind: "generic",
          attestationRef: "",
        },
      }),
    ).rejects.toThrow(/attestationRef/);
  });
});
