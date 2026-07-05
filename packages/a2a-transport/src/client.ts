import { v4 as uuidv4 } from "uuid";
import type { Message, MessageSendParams, Part } from "@a2a-js/sdk";
import type { Client } from "@a2a-js/sdk/client";
import type { DataObject } from "@qwixl/protocol";
import { dataObjectToPart } from "./parts.js";
import { mlsWireToPart } from "./mlsWire.js";
import type { MlsWireMessage } from "@qwixl/mls-session";
import { mlsHandshakeToPart, type AtomMlsHandshakeEnvelope } from "./mlsHandshake.js";

export interface SendDataObjectParams {
  object: DataObject;
  contextId?: string;
  role?: "user" | "agent";
}

export interface SendMlsWireParams {
  wire: MlsWireMessage;
  contextId?: string;
  role?: "user" | "agent";
  senderDid?: string;
}

export interface SendMlsHandshakeParams {
  handshake: AtomMlsHandshakeEnvelope;
  contextId?: string;
  role?: "user" | "agent";
}

async function sendParts(
  client: Client,
  parts: Part[],
  params: { contextId?: string; role?: "user" | "agent" },
): Promise<Message> {
  const sendParams: MessageSendParams = {
    message: {
      kind: "message",
      messageId: uuidv4(),
      role: params.role ?? "user",
      contextId: params.contextId,
      parts,
    },
  };
  const response = await client.sendMessage(sendParams);
  if (!response || typeof response !== "object" || !("parts" in response)) {
    throw new Error("Peer agent did not return a message");
  }
  return response as Message;
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
  return sendParts(client, [mlsWireToPart(params.wire, params.senderDid)], params);
}

/** Send MLS pair handshake metadata via A2A. */
export async function sendMlsHandshake(
  client: Client,
  params: SendMlsHandshakeParams,
): Promise<Message> {
  return sendParts(client, [mlsHandshakeToPart(params.handshake)], params);
}
