import type { AgentCard } from "@a2a-js/sdk";
import { ATOM_A2A_EXTENSION, ATOM_COMMS_SKILL_ID, ATOM_COORDINATION_SKILL_ID } from "./constants.js";

export interface AtomAgentCardOptions {
  name: string;
  description: string;
  baseUrl: string;
  version?: string;
  publisherDid?: string;
}

/** Build an A2A agent card for Atom comms agents. */
export function buildAtomAgentCard(options: AtomAgentCardOptions): AgentCard {
  const jsonRpcUrl = `${options.baseUrl.replace(/\/$/, "")}/a2a/jsonrpc`;
  return {
    name: options.name,
    description: options.description,
    protocolVersion: "0.3.0",
    version: options.version ?? "0.1.0",
    url: jsonRpcUrl,
    skills: [
      {
        id: ATOM_COMMS_SKILL_ID,
        name: "Atom comms",
        description: "Exchange signed Atom data objects",
        tags: ["comms", "data-object"],
      },
      {
        id: ATOM_COORDINATION_SKILL_ID,
        name: "Atom coordination",
        description: "Scheduling and RSVP data objects between agents",
        tags: ["coordination", "scheduling", "rsvp"],
      },
    ],
    capabilities: {
      pushNotifications: false,
      extensions: [{ uri: ATOM_A2A_EXTENSION, required: false }],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    additionalInterfaces: [{ url: jsonRpcUrl, transport: "JSONRPC" }],
    ...(options.publisherDid
      ? { provider: { organization: "Atom", url: options.baseUrl }, iconUrl: undefined }
      : {}),
  };
}
