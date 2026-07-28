import { A2A_PROTOCOL_VERSION, type AgentCard } from "@a2a-js/sdk";
import { A2A_LEGACY_PROTOCOL_VERSION } from "@a2a-js/sdk/compat/v0_3";
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
  /**
   * Advertise the v0.3 interface alongside v1.0 so peers still on the old
   * protocol keep talking to this agent. Defaults to true for the duration of
   * the migration; the server's legacy compat layer must be enabled to match.
   */
  legacyInterface?: boolean;
}

/** The single JSON-RPC path Atom serves. Both protocol versions share it. */
export function atomJsonRpcUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/a2a/jsonrpc`;
}

/**
 * Build an A2A agent card for Atom comms agents.
 *
 * The v1.0 card has no top-level `url` or `protocolVersion`. Both moved into
 * `supportedInterfaces`, which is an ordered list where the first entry is the
 * preferred one — so we list v1.0 first and v0.3 second, on the same URL. That
 * ordering is what lets a peer choose: a v1.0 client sees its own version at the
 * front, and a v0.3 client sees an interface it recognises rather than a card it
 * cannot use. The two are served from one endpoint because the SDK's legacy compat
 * layer dispatches on the `A2A-Version` header rather than on the path.
 */
export function buildAtomAgentCard(options: AtomAgentCardOptions): AgentCard {
  const jsonRpcUrl = atomJsonRpcUrl(options.baseUrl);
  const legacy = options.legacyInterface ?? true;
  return {
    name: options.name,
    description: options.description,
    version: options.version ?? "0.1.0",
    supportedInterfaces: [
      {
        url: jsonRpcUrl,
        protocolBinding: "JSONRPC",
        protocolVersion: A2A_PROTOCOL_VERSION,
        tenant: "",
      },
      ...(legacy
        ? [
            {
              url: jsonRpcUrl,
              protocolBinding: "JSONRPC",
              protocolVersion: A2A_LEGACY_PROTOCOL_VERSION,
              tenant: "",
            },
          ]
        : []),
    ],
    skills: [
      {
        id: ATOM_COMMS_SKILL_ID,
        name: "Atom comms",
        description: "Exchange signed Atom data objects",
        tags: ["comms", "data-object"],
        examples: [],
        inputModes: [],
        outputModes: [],
        securityRequirements: [],
      },
      {
        id: ATOM_COORDINATION_SKILL_ID,
        name: "Atom coordination",
        description: "Scheduling and RSVP data objects between agents",
        tags: ["coordination", "scheduling", "rsvp"],
        examples: [],
        inputModes: [],
        outputModes: [],
        securityRequirements: [],
      },
      {
        id: ATOM_ACTIONS_SKILL_ID,
        name: "Atom actions",
        description: "Transaction-flow action objects (reserve, execute)",
        tags: ["actions", "reserve"],
        examples: [],
        inputModes: [],
        outputModes: [],
        securityRequirements: [],
      },
      ...(options.business
        ? [
            {
              id: ATOM_COMMERCE_SKILL_ID,
              name: "Atom commerce",
              description: "Purchase intent and signed offer exchange",
              tags: ["commerce", "offer"],
              examples: [],
              inputModes: [],
              outputModes: [],
              securityRequirements: [],
            },
          ]
        : []),
    ],
    capabilities: {
      pushNotifications: false,
      extensions: [
        {
          uri: ATOM_A2A_EXTENSION,
          description: "Signed Atom data objects carried in A2A data parts",
          required: false,
          params: undefined,
        },
        ...(options.business
          ? [
              {
                uri: ATOM_BUSINESS_EXTENSION,
                description: "Business storefront identity and verification tier",
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
                description: "Labeled swarm agent operated by Qwixl",
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
    securitySchemes: {},
    securityRequirements: [],
    signatures: [],
    provider: options.publisherDid
      ? { organization: "Atom", url: options.baseUrl }
      : undefined,
  };
}

/**
 * The URL a client should dial for a given card, preferring the first interface
 * it declares. Replaces reads of the v0.3 top-level `card.url`.
 */
export function agentCardUrl(card: AgentCard): string | undefined {
  return card.supportedInterfaces?.[0]?.url;
}

/**
 * Point every interface on a card at `baseUrl`, keeping their protocol versions.
 *
 * Needed wherever the real address is only known after the socket is bound — a
 * server listening on port 0 — because the URL now appears once per declared
 * interface instead of once on the card.
 */
export function rebindAtomAgentCard(card: AgentCard, baseUrl: string): AgentCard {
  const url = atomJsonRpcUrl(baseUrl);
  card.supportedInterfaces = card.supportedInterfaces.map((iface) => ({ ...iface, url }));
  return card;
}
