import { describe, expect, it } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import {
  COORDINATION_PROPOSAL_PURPOSE,
  COORDINATION_RESPONSE_PURPOSE,
} from "./constants.js";
import {
  createCoordinationReceipt,
  createRsvpRequest,
  createRsvpResponse,
  createSchedulingProposal,
  createSchedulingResponse,
  verifyCoordinationObjectByPurpose,
  verifyCoordinationReceipt,
  verifyRsvpRequest,
  verifyRsvpResponse,
  verifySchedulingProposal,
  verifySchedulingResponse,
} from "./coordination.js";

const SLOTS = [
  {
    id: "tue-10",
    label: "Tue 8 Jul · 10:00–10:30",
    start: "2026-07-08T10:00:00.000Z",
    end: "2026-07-08T10:30:00.000Z",
  },
];

describe("coordination data objects", () => {
  it("round-trips scheduling proposal and response", async () => {
    const organizer = await generateAgentKeyPair();
    const invitee = await generateAgentKeyPair();

    const proposal = await createSchedulingProposal({
      identity: organizer,
      payload: { title: "Team standup", slots: SLOTS, threadId: "thread-1" },
    });
    const verifiedProposal = await verifySchedulingProposal(proposal);
    expect(verifiedProposal.payload.title).toBe("Team standup");
    expect(verifiedProposal.object.governance.purpose).toBe(COORDINATION_PROPOSAL_PURPOSE);

    const response = await createSchedulingResponse({
      identity: invitee,
      payload: {
        proposalId: proposal.id,
        response: "accept",
        slotId: "tue-10",
        threadId: "thread-1",
      },
    });
    const verifiedResponse = await verifySchedulingResponse(response);
    expect(verifiedResponse.payload.proposalId).toBe(proposal.id);
    expect(verifiedResponse.object.governance.purpose).toBe(COORDINATION_RESPONSE_PURPOSE);
  });

  it("round-trips RSVP request and response", async () => {
    const organizer = await generateAgentKeyPair();
    const invitee = await generateAgentKeyPair();

    const request = await createRsvpRequest({
      identity: organizer,
      payload: {
        eventTitle: "Design review",
        eventAt: "2026-07-10T15:00:00.000Z",
        location: "Room 4",
      },
    });
    const verifiedRequest = await verifyRsvpRequest(request);
    expect(verifiedRequest.payload.eventTitle).toBe("Design review");

    const response = await createRsvpResponse({
      identity: invitee,
      payload: { rsvpId: request.id, response: "yes" },
    });
    const verifiedResponse = await verifyRsvpResponse(response);
    expect(verifiedResponse.payload.rsvpId).toBe(request.id);
    expect(verifiedResponse.payload.response).toBe("yes");
  });

  it("creates coordination receipt", async () => {
    const identity = await generateAgentKeyPair();
    const receipt = await createCoordinationReceipt({
      identity,
      payload: { refId: "abc", action: "calendar-hold", attestationRef: "att-1" },
    });
    const verified = await verifyCoordinationReceipt(receipt);
    expect(verified.payload.action).toBe("calendar-hold");
  });

  it("verifyCoordinationObjectByPurpose dispatches by purpose", async () => {
    const identity = await generateAgentKeyPair();
    const proposal = await createSchedulingProposal({
      identity,
      payload: { title: "Sync", slots: SLOTS },
    });
    const result = await verifyCoordinationObjectByPurpose(proposal);
    expect(result.purpose).toBe(COORDINATION_PROPOSAL_PURPOSE);
  });

  it("rejects accept response without slotId", async () => {
    const identity = await generateAgentKeyPair();
    await expect(
      createSchedulingResponse({
        identity,
        payload: { proposalId: "p1", response: "accept" },
      }),
    ).rejects.toThrow(/slotId/);
  });
});
