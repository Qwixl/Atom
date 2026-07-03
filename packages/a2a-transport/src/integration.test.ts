import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { ClientFactory } from "@a2a-js/sdk/client";
import {
  generateAgentKeyPair,
  signDataObject,
  type AgentKeyPair,
} from "@qwixl/protocol";
import {
  AtomDataObjectExecutor,
  buildAtomAgentCard,
  COMMS_MESSAGE_PURPOSE,
  sendDataObject,
} from "./index.js";
import { createAtomA2aExpressApp } from "./server-entry.js";
import { verifyMessageDataObjects } from "./parts.js";

describe("A2A integration", () => {
  it("delivers signed data objects between agents", async () => {
    const receiverIdentity = await generateAgentKeyPair();
    const senderIdentity = await generateAgentKeyPair();
    const received: string[] = [];

    let baseUrl = "";
    const executor = new AtomDataObjectExecutor({
      identity: receiverIdentity,
      allowedPurposes: [COMMS_MESSAGE_PURPOSE, "comms:receipt"],
      sendReceipt: true,
      onReceive: (event) => {
        received.push(String(event.object.payload.text));
      },
    });

    const agentCard = buildAtomAgentCard({
      name: "Test receiver",
      description: "Integration test agent",
      baseUrl: "http://127.0.0.1:0",
    });

    const app = createAtomA2aExpressApp({ agentCard, executor });
    const server: Server = await new Promise((resolve) => {
      const s = createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    agentCard.url = `${baseUrl}/a2a/jsonrpc`;
    agentCard.additionalInterfaces = [{ url: agentCard.url, transport: "JSONRPC" }];

    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "integration ping" },
        governance: { purpose: COMMS_MESSAGE_PURPOSE },
      },
      senderIdentity as AgentKeyPair,
    );

    const factory = new ClientFactory();
    const client = await factory.createFromUrl(baseUrl);
    const response = await sendDataObject(client, { object, role: "user" });

    expect(received).toEqual(["integration ping"]);
    const receipts = await verifyMessageDataObjects(response, {
      allowedPurposes: ["comms:receipt"],
    });
    expect(receipts.length).toBeGreaterThan(0);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
