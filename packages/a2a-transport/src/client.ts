import { v4 as uuidv4 } from "uuid";
import type { Message, MessageSendParams } from "@a2a-js/sdk";
import type { Client } from "@a2a-js/sdk/client";
import type { DataObject } from "@qwixl/protocol";
import { dataObjectToPart } from "./parts.js";

export interface SendDataObjectParams {
  object: DataObject;
  contextId?: string;
  role?: "user" | "agent";
}

/** Send a verified data object to a peer agent via A2A. */
export async function sendDataObject(
  client: Client,
  params: SendDataObjectParams,
): Promise<Message> {
  const sendParams: MessageSendParams = {
    message: {
      kind: "message",
      messageId: uuidv4(),
      role: params.role ?? "user",
      contextId: params.contextId,
      parts: [dataObjectToPart(params.object)],
    },
  };
  const response = await client.sendMessage(sendParams);
  if (!response || typeof response !== "object" || !("parts" in response)) {
    throw new Error("Peer agent did not return a message");
  }
  return response as Message;
}
