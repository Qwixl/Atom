import type { Message, Part, SendMessageRequest } from "@a2a-js/sdk";
import type { Client } from "@a2a-js/sdk/client";
import type { DataObject } from "@qwixl/protocol";
import { dataObjectToPart } from "./parts.js";
import { mlsWireToPart } from "./mlsWire.js";
import type { MlsWireMessage } from "@qwixl/mls-session";
import { mlsHandshakeToPart, type AtomMlsHandshakeEnvelope } from "./mlsHandshake.js";
import { atomMessage, type AtomRole } from "./message.js";

export interface SendDataObjectParams {
  object: DataObject;
  contextId?: string;
  role?: AtomRole;
}

export interface SendMlsWireParams {
  wire: MlsWireMessage;
  contextId?: string;
  role?: AtomRole;
  senderDid?: string;
}

export interface SendMlsHandshakeParams {
  handshake: AtomMlsHandshakeEnvelope;
  contextId?: string;
  role?: AtomRole;
}

async function sendParts(
  client: Client,
  parts: Part[],
  params: {
    contextId?: string;
    role?: AtomRole;
    /** Defaults true. MLS-only paths pass false (D130 Option A). */
    declareDataObjectExtension?: boolean;
  },
): Promise<Message> {
  const request: SendMessageRequest = {
    message: atomMessage({
      parts,
      role: params.role,
      contextId: params.contextId,
      declareDataObjectExtension: params.declareDataObjectExtension,
    }),
    tenant: "",
    configuration: undefined,
    metadata: undefined,
  };
  // v1.0 returns `Message | Task`; Atom peers answer inline, so a task means the
  // peer is not speaking the Atom extension even if the transport succeeded.
  const response = await client.sendMessage(request);
  if (!response || typeof response !== "object" || !("parts" in response)) {
    throw new Error("Peer agent did not return a message");
  }
  return response;
}

/** Send a verified data object to a peer agent via A2A. */
export async function sendDataObject(
  client: Client,
  params: SendDataObjectParams,
): Promise<Message> {
  return sendParts(client, [dataObjectToPart(params.object)], params);
}

/** Send MLS wire bytes (application message, welcome, or key package) via A2A. */
export async function sendMlsWire(client: Client, params: SendMlsWireParams): Promise<Message> {
  return sendParts(client, [mlsWireToPart(params.wire, params.senderDid)], {
    ...params,
    declareDataObjectExtension: false,
  });
}

/** Send MLS pair handshake metadata via A2A. */
export async function sendMlsHandshake(
  client: Client,
  params: SendMlsHandshakeParams,
): Promise<Message> {
  return sendParts(client, [mlsHandshakeToPart(params.handshake)], {
    ...params,
    declareDataObjectExtension: false,
  });
}
