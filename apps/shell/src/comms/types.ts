import type { RsvpAnswer, SchedulingResponseKind, SchedulingSlot, ActionReserveRefKind } from "@qwixl/a2a-transport";

export interface AgentContact {
  id: string;
  did: string;
  name: string;
  /** A2A JSON-RPC endpoint of the peer agent. */
  endpoint: string;
  connectedAt?: string;
  /** Categories pre-approved for disclosure to this contact's agent (owner-store policy). */
  standingDisclosure?: string[];
}

export interface CommsAgentConfig {
  /** Admin API base URL, e.g. http://127.0.0.1:5204 */
  adminUrl: string;
}

export interface InboxEntryWire {
  object: {
    id: string;
    issuerDid: string;
    governance: { purpose: string };
    payload: Record<string, unknown>;
    issuedAt: string;
  };
  receivedAt: string;
  contextId?: string;
}

export interface CommsMessage {
  id: string;
  direction: "in" | "out";
  text: string;
  at: string;
  peerDid: string;
}

export type CommsThreadItem =
  | ({ kind: "message" } & CommsMessage)
  | {
      kind: "scheduling-proposal";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      title: string;
      slots: SchedulingSlot[];
    }
  | {
      kind: "scheduling-response";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      proposalId: string;
      response: SchedulingResponseKind;
      slotId?: string;
    }
  | {
      kind: "rsvp-request";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      eventTitle: string;
      eventAt: string;
      location?: string;
    }
  | {
      kind: "rsvp-response";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      rsvpId: string;
      response: RsvpAnswer;
    }
  | {
      kind: "action-reserve";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      refId: string;
      refKind: ActionReserveRefKind;
      label: string;
      attestationRef: string;
    };
