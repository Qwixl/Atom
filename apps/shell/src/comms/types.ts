import type {
  RsvpAnswer,
  SchedulingResponseKind,
  SchedulingSlot,
  ActionReserveRefKind,
  MonetaryAmount,
} from "@qwixl/a2a-transport";

export type TttMark = "X" | "O" | null;
export type TttBoard = TttMark[];

export type BsPlayer = "A" | "B";
export type BsPhase = "setup" | "battle" | "won";

export interface BsShot {
  cell: number;
  shooter: BsPlayer;
  hit: boolean;
}

export interface AgentContact {
  id: string;
  did: string;
  name: string;
  /** Human-facing @handle when known (M20). */
  handle?: string;
  /** A2A JSON-RPC endpoint of the peer agent. */
  endpoint: string;
  connectedAt?: string;
  /** Categories pre-approved for disclosure to this contact's agent (owner-store policy). */
  standingDisclosure?: string[];
  /** M19.4 address book metadata. */
  kind?: "person" | "business" | "community";
  source?: "invite" | "discover" | "room";
  blocked?: boolean;
  muted?: boolean;
}

export interface CommsAgentConfig {
  /** Admin API base URL, e.g. http://127.0.0.1:5204 */
  adminUrl: string;
  /** Bearer token for admin API (M13.1). */
  adminToken?: string;
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
      /** Agent wire id; not shown in human UI when slotLabel is available. */
      slotId?: string;
      /** Human-facing time label resolved from proposal or slot id. */
      slotLabel?: string;
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
    }
  | {
      kind: "transaction-hold";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      transactionId: string;
      amount: MonetaryAmount;
      label?: string;
      rail: string;
      expiresAt?: string;
    }
  | {
      kind: "transaction-confirm";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      transactionId: string;
      role: "payer" | "payee";
      amount: MonetaryAmount;
      label?: string;
    }
  | {
      kind: "transaction-status";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      transactionId: string;
      status: "capture" | "release" | "receipt";
      amount?: MonetaryAmount;
      reason?: string;
    }
  | {
      kind: "commerce-intent";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      intentId: string;
      catalogItemId?: string;
      query?: string;
    }
  | {
      kind: "commerce-offer";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      offerId: string;
      intentId: string;
      catalogItemId: string;
      label: string;
      amount: MonetaryAmount;
      available: boolean;
      terms: string[];
      sponsored?: boolean;
    }
  | {
      kind: "commerce-decline";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      intentId: string;
      reasonCode: string;
      note?: string;
    }
  | {
      kind: "poll-request";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      question: string;
      options: Array<{ id: string; label: string }>;
    }
  | {
      kind: "poll-vote";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      pollId: string;
      optionId: string;
    }
  | {
      kind: "ttt-state";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      gameId: string;
      board: TttBoard;
      turn: "X" | "O";
      status: "active" | "won" | "draw";
      winner?: "X" | "O";
    }
  | {
      kind: "ttt-move";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      gameId: string;
      cell: number;
      mark: "X" | "O";
    }
  | {
      kind: "bs-state";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      gameId: string;
      phase: BsPhase;
      turn: BsPlayer;
      commitA?: string;
      commitB?: string;
      shots: BsShot[];
      winner?: BsPlayer;
    }
  | {
      kind: "bs-shot";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      gameId: string;
      cell: number;
      shooter: BsPlayer;
    }
  | {
      kind: "shared-list";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      listId: string;
      title: string;
      items: Array<{ id: string; text: string; done: boolean }>;
    }
  | {
      kind: "shared-list-update";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      listId: string;
      title?: string;
      items: Array<{ id: string; text: string; done: boolean }>;
    }
  | {
      kind: "location-pin";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      pinId: string;
      label: string;
      lat: number;
      lng: number;
      note?: string;
    }
  | {
      kind: "split-proposal";
      id: string;
      direction: "in" | "out";
      at: string;
      peerDid: string;
      splitId: string;
      label: string;
      totalMinor: number;
      currency: string;
      splitCount: number;
      shareMinor: number;
    };
