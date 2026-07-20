import type { AgentCard } from "@a2a-js/sdk";
import {
  ATOM_A2A_EXTENSION,
  ATOM_ACTIONS_SKILL_ID,
  ATOM_COMMS_SKILL_ID,
  ATOM_COMMERCE_SKILL_ID,
  ATOM_COORDINATION_SKILL_ID,
  ATOM_BUSINESS_EXTENSION,
  ATOM_SWARM_EXTENSION,
} from "./constants.js";

/** Build an A2A agent card for Atom comms agents. */
export interface AtomBusinessProfile {
  verificationTier: number;
  businessDomain: string;
  tierLabel: string;
}

export type AtomSwarmAgentKind = "swarm-npc" | "swarm-police";

export interface AtomAgentCardOptions {
  name: string;
  description: string;
  baseUrl: string;
  version?: string;
  publisherDid?: string;
  /** M12 business storefront fields (D039 tier disclosure). */
  business?: AtomBusinessProfile;
  /** D087 — labeled swarm roles for Discover / peers. */
  swarmKind?: AtomSwarmAgentKind;
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
      {
        id: ATOM_ACTIONS_SKILL_ID,
        name: "Atom actions",
        description: "Transaction-flow action objects (reserve, execute)",
        tags: ["actions", "reserve"],
      },
      ...(options.business
        ? [
            {
              id: ATOM_COMMERCE_SKILL_ID,
              name: "Atom commerce",
              description: "Purchase intent and signed offer exchange",
              tags: ["commerce", "offer"],
            },
          ]
        : []),
    ],
    capabilities: {
      pushNotifications: false,
      extensions: [
        { uri: ATOM_A2A_EXTENSION, required: false },
        ...(options.business
          ? [
              {
                uri: ATOM_BUSINESS_EXTENSION,
                required: false,
                params: {
                  verificationTier: options.business.verificationTier,
                  businessDomain: options.business.businessDomain,
                  tierLabel: options.business.tierLabel,
                  ...(options.publisherDid ? { agentDid: options.publisherDid } : {}),
                },
              },
            ]
          : []),
        ...(options.swarmKind
          ? [
              {
                uri: ATOM_SWARM_EXTENSION,
                required: false,
                params: {
                  agentKind: options.swarmKind,
                  labeled: true,
                  operator: "Qwixl",
                  ...(options.publisherDid ? { agentDid: options.publisherDid } : {}),
                },
              },
            ]
          : []),
      ],
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    additionalInterfaces: [{ url: jsonRpcUrl, transport: "JSONRPC" }],
    ...(options.publisherDid
      ? { provider: { organization: "Atom", url: options.baseUrl }, iconUrl: undefined }
      : {}),
  };
}
