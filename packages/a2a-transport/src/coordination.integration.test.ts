import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { ClientFactory } from "@a2a-js/sdk/client";
import { generateAgentKeyPair, type AgentKeyPair } from "@qwixl/protocol";
import {
  AtomDataObjectExecutor,
  buildAtomAgentCard,
  COORDINATION_PROPOSAL_PURPOSE,
  COORDINATION_RESPONSE_PURPOSE,
  createSchedulingProposal,
  createSchedulingResponse,
  sendDataObject,
  verifySchedulingProposal,
  verifySchedulingResponse,
} from "./index.js";
import { createAtomA2aExpressApp } from "./server-entry.js";

describe("coordination A2A integration", () => {
  it("delivers scheduling proposal and response between agents", async () => {
    const organizerIdentity = await generateAgentKeyPair();
    const inviteeIdentity = await generateAgentKeyPair();
    const received: string[] = [];

    const executor = new AtomDataObjectExecutor({
      identity: inviteeIdentity,
      allowedPurposes: [COORDINATION_PROPOSAL_PURPOSE, COORDINATION_RESPONSE_PURPOSE],
      sendReceipt: false,
      onReceive: (event) => {
        received.push(event.object.governance.purpose);
      },
    });

    const agentCard = buildAtomAgentCard({
      name: "Invitee agent",
      description: "Coordination integration test",
      baseUrl: "http://127.0.0.1:0",
    });

    const app = createAtomA2aExpressApp({ agentCard, executor });
    const server: Server = await new Promise((resolve) => {
      const s = createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });

    const addr = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    agentCard.url = `${baseUrl}/a2a/jsonrpc`;
    agentCard.additionalInterfaces = [{ url: agentCard.url, transport: "JSONRPC" }];

    const proposal = await createSchedulingProposal({
      identity: organizerIdentity as AgentKeyPair,
      payload: {
        title: "Team standup",
        slots: [
          {
            id: "tue-10",
            label: "Tue 10:00",
            start: "2026-07-08T10:00:00.000Z",
            end: "2026-07-08T10:30:00.000Z",
          },
        ],
      },
    });
    await verifySchedulingProposal(proposal);

    const factory = new ClientFactory();
    const client = await factory.createFromUrl(baseUrl);
    await sendDataObject(client, { object: proposal, role: "user" });
    expect(received).toEqual([COORDINATION_PROPOSAL_PURPOSE]);

    const response = await createSchedulingResponse({
      identity: inviteeIdentity as AgentKeyPair,
      payload: { proposalId: proposal.id, response: "accept", slotId: "tue-10" },
    });
    await verifySchedulingResponse(response);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
