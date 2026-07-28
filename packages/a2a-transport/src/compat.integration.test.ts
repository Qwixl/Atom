/**
 * Cross-version interop: an Atom agent on A2A v1.0 talking to a peer still on v0.3.
 *
 * Every other integration test in this package has v1.0 on both ends, so none of
 * them would notice if the compatibility layer stopped working — and the whole
 * migration plan rests on it, because the Atom network contains peers we do not
 * deploy: self-hosted shells, the reference peer sample, and anything built
 * against a published `@qwixl/a2a-transport`. If this test passes, an upgraded
 * agent can be rolled out without waiting for those peers.
 *
 * The peer here is not a mock. It is a real v0.3 server built from the genuine
 * `@a2a-js/sdk@0.3.14`, installed alongside v1.0 under an alias, so the bytes on
 * the wire are the bytes an unmigrated Atom agent would actually send and expect.
 */

import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { AgentCard as LegacyAgentCard, Part as LegacyPart } from "@a2a-js/sdk-v03";
import {
  DefaultRequestHandler as LegacyRequestHandler,
  InMemoryTaskStore as LegacyTaskStore,
  type AgentExecutor as LegacyExecutor,
  type ExecutionEventBus as LegacyEventBus,
  type RequestContext as LegacyRequestContext,
} from "@a2a-js/sdk-v03/server";
import {
  agentCardHandler as legacyCardHandler,
  jsonRpcHandler as legacyJsonRpcHandler,
  UserBuilder as LegacyUserBuilder,
} from "@a2a-js/sdk-v03/server/express";
import { ClientFactory as LegacyClientFactory } from "@a2a-js/sdk-v03/client";
import { generateAgentKeyPair, signDataObject, type AgentKeyPair } from "@qwixl/protocol";
import { ATOM_A2A_EXTENSION, ATOM_DATA_OBJECT_MEDIA_TYPE, COMMS_MESSAGE_PURPOSE } from "./constants.js";
import { buildAtomAgentCard, rebindAtomAgentCard } from "./agentCard.js";
import { signAtomAgentCard } from "./cardSignature.js";
import { AtomDataObjectExecutor } from "./executor.js";
import { createAtomPeerClient } from "./peerClient.js";
import { createAtomA2aExpressApp } from "./server-entry.js";
import { sendDataObject } from "./client.js";

/** A v0.3 agent card, in the shape a peer that never migrated still publishes. */
function legacyAgentCard(baseUrl: string): LegacyAgentCard {
  const url = `${baseUrl}/a2a/jsonrpc`;
  return {
    name: "Legacy peer",
    description: "An Atom peer still running A2A v0.3",
    protocolVersion: "0.3.0",
    version: "0.1.0",
    url,
    skills: [
      {
        id: "atom-comms",
        name: "Atom comms",
        description: "Exchange signed Atom data objects",
        tags: ["comms", "data-object"],
      },
    ],
    capabilities: { pushNotifications: false, extensions: [{ uri: ATOM_A2A_EXTENSION, required: false }] },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    additionalInterfaces: [{ url, transport: "JSONRPC" }],
  } as LegacyAgentCard;
}

describe("A2A v0.3 interop", () => {
  it("delivers an Atom data object from a v1.0 agent to a v0.3 peer", async () => {
    const senderIdentity = (await generateAgentKeyPair()) as AgentKeyPair;
    const receivedTexts: string[] = [];
    const receivedMediaTypes: string[] = [];

    const executor: LegacyExecutor = {
      execute: async (context: LegacyRequestContext, eventBus: LegacyEventBus) => {
        for (const part of context.userMessage.parts as LegacyPart[]) {
          if (part.kind !== "data") continue;
          const envelope = part.data as { mediaType?: string; object?: { payload?: { text?: unknown } } };
          // The v0.3 peer has no `Part.mediaType` to read: it can only find the
          // media type where v0.3 put it, inside the payload. This is the reason
          // Atom writes it in both places rather than moving it to the new field.
          if (envelope.mediaType) receivedMediaTypes.push(envelope.mediaType);
          const text = envelope.object?.payload?.text;
          if (typeof text === "string") receivedTexts.push(text);
        }
        eventBus.publish({
          kind: "message",
          messageId: "legacy-ack",
          role: "agent",
          contextId: context.userMessage.contextId,
          parts: [{ kind: "text", text: "ack from v0.3" }],
        });
        eventBus.finished();
      },
      cancelTask: async () => {},
    };

    const app = express();
    const card = legacyAgentCard("http://127.0.0.1:0");
    const requestHandler = new LegacyRequestHandler(card, new LegacyTaskStore(), executor);
    app.use("/.well-known/agent-card.json", legacyCardHandler({ agentCardProvider: requestHandler }));
    app.use(
      "/a2a/jsonrpc",
      legacyJsonRpcHandler({ requestHandler, userBuilder: LegacyUserBuilder.noAuthentication }),
    );

    const server: Server = await new Promise((resolve) => {
      const s = createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });

    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      card.url = `${baseUrl}/a2a/jsonrpc`;
      card.additionalInterfaces = [{ url: card.url, transport: "JSONRPC" }];

      const object = await signDataObject(
        {
          semantic: { schema: "https://schema.org/Message" },
          payload: { text: "hello across versions" },
          governance: { purpose: COMMS_MESSAGE_PURPOSE },
        },
        senderIdentity,
      );

      const client = await createAtomPeerClient(baseUrl);
      const response = await sendDataObject(client, { object, role: "user" });

      expect(receivedTexts).toEqual(["hello across versions"]);
      expect(receivedMediaTypes).toEqual([ATOM_DATA_OBJECT_MEDIA_TYPE]);
      expect(response.parts.length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("accepts an Atom data object sent by a v0.3 peer to a v1.0 agent", async () => {
    const receiverIdentity = (await generateAgentKeyPair()) as AgentKeyPair;
    const senderIdentity = (await generateAgentKeyPair()) as AgentKeyPair;
    const received: string[] = [];

    const executor = new AtomDataObjectExecutor({
      identity: receiverIdentity,
      allowedPurposes: [COMMS_MESSAGE_PURPOSE, "comms:receipt"],
      sendReceipt: true,
      onReceive: (event) => {
        received.push(String(event.object.payload.text));
      },
    });

    const agentCard = buildAtomAgentCard({
      name: "Upgraded agent",
      description: "An Atom agent on A2A v1.0",
      baseUrl: "http://127.0.0.1:0",
    });
    const app = createAtomA2aExpressApp({ agentCard, executor });
    const server: Server = await new Promise((resolve) => {
      const s = createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });

    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      rebindAtomAgentCard(agentCard, baseUrl);

      const object = await signDataObject(
        {
          semantic: { schema: "https://schema.org/Message" },
          payload: { text: "hello from the past" },
          governance: { purpose: COMMS_MESSAGE_PURPOSE },
        },
        senderIdentity,
      );

      // A genuine v0.3 client: it reads the v0.3 card the compat handler serves it,
      // and posts a v0.3 `message/send` with a `kind: "data"` part.
      const legacyClient = await new LegacyClientFactory().createFromUrl(baseUrl);
      const result = await legacyClient.sendMessage({
        message: {
          kind: "message",
          messageId: "legacy-send",
          role: "user",
          parts: [
            { kind: "data", data: { mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE, object } },
          ] as LegacyPart[],
        },
      });

      expect(received).toEqual(["hello from the past"]);
      expect(result && typeof result === "object" && "parts" in result).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("serves a signed card to peers that omit A2A-Version (legacy well-known)", async () => {
    const identity = (await generateAgentKeyPair()) as AgentKeyPair;
    const executor = new AtomDataObjectExecutor({
      identity,
      allowedPurposes: [COMMS_MESSAGE_PURPOSE],
      sendReceipt: false,
      onReceive: () => {},
    });
    let agentCard = buildAtomAgentCard({
      name: "Signed upgraded agent",
      description: "Signed card must still answer the v0.3 translator",
      baseUrl: "http://127.0.0.1:0",
      publisherDid: identity.did,
      business: {
        verificationTier: 2,
        businessDomain: "example.test",
        tierLabel: "Verified",
      },
    });
    agentCard = await signAtomAgentCard(agentCard, identity);

    const app = createAtomA2aExpressApp({ agentCard, executor });
    const server: Server = await new Promise((resolve) => {
      const s = createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });

    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      rebindAtomAgentCard(agentCard, baseUrl);

      const legacy = await fetch(`${baseUrl}/.well-known/agent-card.json`);
      expect(legacy.status).toBe(200);
      const body = (await legacy.json()) as {
        protocolVersion?: string;
        error?: string;
        signatures?: unknown[];
      };
      expect(body.error).toBeUndefined();
      expect(body.protocolVersion).toMatch(/^0\.3/);
      expect(body.signatures?.length).toBe(1);

      const v1 = await fetch(`${baseUrl}/.well-known/agent-card.json`, {
        headers: { "A2A-Version": "1.0" },
      });
      expect(v1.status).toBe(200);
      const v1Body = (await v1.json()) as { supportedInterfaces?: { protocolVersion: string }[] };
      expect(v1Body.supportedInterfaces?.map((i) => i.protocolVersion)).toEqual(["1.0", "0.3"]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
