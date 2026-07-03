import type { AgentCard, Message } from "@a2a-js/sdk";
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from "uuid";
import {
  signDataObject,
  type AgentKeyPair,
  type DataObject,
  type VerifyDataObjectOptions,
} from "@qwixl/protocol";
import { COMMS_RECEIPT_PURPOSE } from "./constants.js";
import { verifyMessageDataObjects } from "./parts.js";
import { dataObjectToPart } from "./parts.js";

export interface ReceivedDataObjectEvent {
  object: DataObject;
  contextId?: string;
  messageId: string;
}

export interface AtomDataObjectExecutorOptions {
  identity: AgentKeyPair;
  allowedPurposes: string[];
  onReceive: (event: ReceivedDataObjectEvent) => void | Promise<void>;
  /** When true, respond with a signed comms:receipt data object. Default true. */
  sendReceipt?: boolean;
}

/** A2A AgentExecutor that verifies inbound data objects and optionally sends receipts. */
export class AtomDataObjectExecutor implements AgentExecutor {
  private readonly identity: AgentKeyPair;
  private readonly allowedPurposes: string[];
  private readonly onReceive: AtomDataObjectExecutorOptions["onReceive"];
  private readonly sendReceipt: boolean;

  constructor(options: AtomDataObjectExecutorOptions) {
    this.identity = options.identity;
    this.allowedPurposes = options.allowedPurposes;
    this.onReceive = options.onReceive;
    this.sendReceipt = options.sendReceipt ?? true;
  }

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userMessage = requestContext.userMessage;
    if (!userMessage) {
      throw new Error("Missing user message");
    }

    const verifyOptions: VerifyDataObjectOptions = {
      allowedPurposes: this.allowedPurposes,
    };
    const objects = await verifyMessageDataObjects(userMessage, verifyOptions);

    if (objects.length === 0) {
      throw new Error("No valid Atom data objects in message");
    }

    for (const object of objects) {
      await this.onReceive({
        object,
        contextId: userMessage.contextId,
        messageId: userMessage.messageId,
      });
    }

    const parts = [];
    if (this.sendReceipt) {
      for (const object of objects) {
        const receipt = await signDataObject(
          {
            semantic: { schema: "https://atom.qwixl.dev/schema/CommsReceipt" },
            payload: {
              receivedId: object.id,
              receivedAt: new Date().toISOString(),
              issuerDid: object.issuerDid,
            },
            governance: { purpose: COMMS_RECEIPT_PURPOSE, ttlSeconds: 86400 },
          },
          this.identity,
        );
        parts.push(dataObjectToPart(receipt));
      }
    }

    const response: Message = {
      kind: "message",
      messageId: uuidv4(),
      role: "agent",
      contextId: userMessage.contextId,
      parts: parts.length > 0 ? parts : [{ kind: "text", text: "Received." }],
    };

    eventBus.publish(response);
    eventBus.finished();
  }

  cancelTask = async (): Promise<void> => {};
}

export type { AgentCard };
