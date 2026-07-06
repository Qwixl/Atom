import {
  COMMS_MESSAGE_PURPOSE,
  COMMS_MESSAGE_SCHEMA,
  type ActionReserveRefKind,
  type RsvpAnswer,
  type SchedulingResponseKind,
  type SchedulingSlot,
  type VerifiedContactInvite,
} from "@qwixl/a2a-transport";
import type { BusinessCatalogItemValue } from "@qwixl/owner-store";
import type { UnsignedDataObject } from "@qwixl/protocol";
import type { BusinessIndexEntry } from "@qwixl/business-index";
import type { InboxEntryWire, AgentContact } from "./types.js";
import { formatAgentError } from "./agentErrors.js";
import { assertProductionAgentUrl } from "../productionGuard.js";

export interface ResolvedDiscoverTarget {
  adminBase: string;
  agentCardUrl: string;
  did: string;
  resolvedVia: "local" | "localhost-probe" | "registry" | "well-known" | "index-url";
}

function adminHeaders(adminToken?: string): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminToken?.trim()) {
    headers.Authorization = `Bearer ${adminToken.trim()}`;
  }
  return headers;
}

async function postJson<T>(
  adminUrl: string,
  path: string,
  body: Record<string, unknown>,
  adminToken?: string,
): Promise<T> {
  assertProductionAgentUrl(adminUrl);
  const resp = await fetch(`${adminUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: adminHeaders(adminToken),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(formatAgentError(new Error(err.error ?? `Request failed (${resp.status})`)));
  }
  return resp.json() as Promise<T>;
}

async function getJson<T>(adminUrl: string, path: string, adminToken?: string): Promise<T> {
  assertProductionAgentUrl(adminUrl);
  const headers: Record<string, string> = {};
  if (adminToken?.trim()) {
    headers.Authorization = `Bearer ${adminToken.trim()}`;
  }
  const resp = await fetch(`${adminUrl.replace(/\/$/, "")}${path}`, { headers });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(formatAgentError(new Error(err.error ?? `Request failed (${resp.status})`)));
  }
  return resp.json() as Promise<T>;
}

export class CommsAgentClient {
  constructor(
    private readonly adminUrl: string,
    private readonly adminToken?: string,
  ) {}

  private base(): string {
    return this.adminUrl.replace(/\/$/, "");
  }

  async health(): Promise<{ ok: boolean; did: string; inbox: number; mlsPeers: string[] }> {
    return getJson(this.base(), "/health", this.adminToken);
  }

  async inbox(): Promise<InboxEntryWire[]> {
    const body = await getJson<{ entries?: InboxEntryWire[] }>(this.base(), "/inbox", this.adminToken);
    return body.entries ?? [];
  }

  async createInvite(ttlSeconds?: number): Promise<{ token: string; issuerDid: string }> {
    return postJson(
      this.base(),
      "/invite",
      ttlSeconds ? { ttlSeconds } : {},
      this.adminToken,
    );
  }

  async connectInvite(invite: string): Promise<{ connected: string }> {
    return postJson(this.base(), "/mls/connect", { invite: invite.trim() }, this.adminToken);
  }

  async connectPeer(peerUrl: string, peerDid?: string): Promise<{ connected: string }> {
    return postJson(
      this.base(),
      "/mls/connect",
      { peerUrl: peerUrl.trim(), ...(peerDid?.trim() ? { peerDid: peerDid.trim() } : {}) },
      this.adminToken,
    );
  }

  async resolveDiscoverEntry(entry: BusinessIndexEntry): Promise<ResolvedDiscoverTarget> {
    const body = await postJson<{ resolved: ResolvedDiscoverTarget }>(
      this.base(),
      "/discover/resolve",
      entry as unknown as Record<string, unknown>,
      this.adminToken,
    );
    return body.resolved;
  }

  async filterAvailableDiscoverEntries(
    entries: BusinessIndexEntry[],
  ): Promise<Array<{ entry: BusinessIndexEntry; resolved: ResolvedDiscoverTarget }>> {
    const body = await postJson<{
      available: Array<{ entry: BusinessIndexEntry; resolved: ResolvedDiscoverTarget }>;
    }>(this.base(), "/discover/availability", { entries }, this.adminToken);
    return body.available;
  }

  async discoverSearch(opts: {
    terms: string;
    kind?: import("@qwixl/business-index").IndexEntryKind;
    indexBaseUrl?: string;
    indexes?: Array<{ label: string; url: string }>;
  }): Promise<{
    summary: string;
    results: Array<{
      entry: BusinessIndexEntry;
      resolved: ResolvedDiscoverTarget;
      indexLabel: string;
    }>;
  }> {
    return postJson(this.base(), "/discover/search", opts, this.adminToken);
  }

  async sendText(opts: {
    peerUrl: string;
    peerDid: string;
    text: string;
    encrypt: boolean;
  }): Promise<void> {
    const message: UnsignedDataObject = {
      semantic: { schema: COMMS_MESSAGE_SCHEMA },
      payload: { text: opts.text.trim() },
      governance: { purpose: COMMS_MESSAGE_PURPOSE },
    };
    await postJson(
      this.base(),
      "/send",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        message,
        encrypt: opts.encrypt,
      },
      this.adminToken,
    );
  }

  async sendSchedulingProposal(opts: {
    peerUrl: string;
    peerDid: string;
    title: string;
    slots: SchedulingSlot[];
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/coordination/scheduling-proposal",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        title: opts.title,
        slots: opts.slots,
        encrypt: opts.encrypt ?? true,
      },
      this.adminToken,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendSchedulingResponse(opts: {
    peerUrl: string;
    peerDid: string;
    proposalId: string;
    response: SchedulingResponseKind;
    slotId?: string;
    encrypt?: boolean;
  }): Promise<void> {
    await postJson(
      this.base(),
      "/coordination/scheduling-response",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        proposalId: opts.proposalId,
        response: opts.response,
        slotId: opts.slotId,
        encrypt: opts.encrypt ?? true,
      },
      this.adminToken,
    );
  }

  async sendRsvpRequest(opts: {
    peerUrl: string;
    peerDid: string;
    eventTitle: string;
    eventAt: string;
    location?: string;
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/coordination/rsvp",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        eventTitle: opts.eventTitle,
        eventAt: opts.eventAt,
        location: opts.location,
        encrypt: opts.encrypt ?? true,
      },
      this.adminToken,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendRsvpResponse(opts: {
    peerUrl: string;
    peerDid: string;
    rsvpId: string;
    response: RsvpAnswer;
    encrypt?: boolean;
  }): Promise<void> {
    await postJson(
      this.base(),
      "/coordination/rsvp-response",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        rsvpId: opts.rsvpId,
        response: opts.response,
        encrypt: opts.encrypt ?? true,
      },
      this.adminToken,
    );
  }

  async sendPoll(opts: {
    peerUrl: string;
    peerDid: string;
    question: string;
    options: Array<{ id: string; label: string }>;
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/coordination/poll",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        question: opts.question,
        options: opts.options,
        encrypt: opts.encrypt ?? true,
      },
      this.adminToken,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendPollVote(opts: {
    peerUrl: string;
    peerDid: string;
    pollId: string;
    optionId: string;
    encrypt?: boolean;
  }): Promise<void> {
    await postJson(
      this.base(),
      "/coordination/poll-vote",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        pollId: opts.pollId,
        optionId: opts.optionId,
        encrypt: opts.encrypt ?? true,
      },
      this.adminToken,
    );
  }

  async sendTttState(opts: {
    peerUrl: string;
    peerDid: string;
    gameId: string;
    board: Array<"X" | "O" | null>;
    turn: "X" | "O";
    status: "active" | "won" | "draw";
    winner?: "X" | "O";
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/coordination/ttt-state",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        gameId: opts.gameId,
        board: opts.board,
        turn: opts.turn,
        status: opts.status,
        winner: opts.winner,
        encrypt: opts.encrypt ?? true,
      },
      this.adminToken,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendTttMove(opts: {
    peerUrl: string;
    peerDid: string;
    gameId: string;
    cell: number;
    mark: "X" | "O";
    encrypt?: boolean;
  }): Promise<void> {
    await postJson(
      this.base(),
      "/coordination/ttt-move",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        gameId: opts.gameId,
        cell: opts.cell,
        mark: opts.mark,
        encrypt: opts.encrypt ?? true,
      },
      this.adminToken,
    );
  }

  async connectorStatus(connectorId: string): Promise<{
    connectorId: string;
    provider: string;
    label?: string;
    configured: boolean;
    oauthAvailable?: boolean;
    oauthConnected?: boolean;
    vaultOnly?: boolean;
  }> {
    return getJson(this.base(), `/connectors/${encodeURIComponent(connectorId)}/status`, this.adminToken);
  }

  async invokeConnector(
    connectorId: string,
    operation: string,
    input: Record<string, unknown>,
    approvalRef?: string,
  ): Promise<{ operation: string; result: unknown }> {
    return postJson(
      this.base(),
      `/connectors/${encodeURIComponent(connectorId)}/invoke`,
      { operation, input, approvalRef },
      this.adminToken,
    );
  }

  async addWebcalFeed(url: string, label?: string): Promise<{ feed: { id: string; label: string } }> {
    return postJson(this.base(), "/connectors/webcal/feeds", { url, label }, this.adminToken);
  }

  async removeWebcalFeed(feedId: string): Promise<{ removed: boolean; feedId: string }> {
    const headers: Record<string, string> = {};
    if (this.adminToken?.trim()) {
      headers.Authorization = `Bearer ${this.adminToken.trim()}`;
    }
    const resp = await fetch(
      `${this.base()}/connectors/webcal/feeds/${encodeURIComponent(feedId)}`,
      { method: "DELETE", headers },
    );
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ removed: boolean; feedId: string }>;
  }

  async createActionReserve(opts: {
    refId: string;
    refKind: ActionReserveRefKind;
    attestationRef: string;
    subjectId?: string;
    label?: string;
    start?: string;
    end?: string;
    peerDid?: string;
    peerUrl?: string;
    encrypt?: boolean;
  }): Promise<{ object: { id: string } }> {
    return postJson(this.base(), "/actions/reserve", opts, this.adminToken);
  }

  async confirmTransaction(opts: {
    transactionId: string;
    attestationRef: string;
    peerUrl: string;
    peerDid: string;
    encrypt?: boolean;
  }): Promise<{ transaction: { phase: string } }> {
    return postJson(this.base(), "/transactions/confirm", opts, this.adminToken);
  }

  async declineTransaction(opts: {
    transactionId: string;
    attestationRef?: string;
    note?: string;
    peerUrl: string;
    peerDid: string;
    encrypt?: boolean;
  }): Promise<{ transaction: { phase: string } }> {
    return postJson(this.base(), "/transactions/decline", opts, this.adminToken);
  }

  async sendCommerceIntent(opts: {
    intentId: string;
    catalogItemId?: string;
    query?: string;
    replyUrl: string;
    peerUrl: string;
    peerDid: string;
    encrypt?: boolean;
    maxAmountMinor?: number;
    currency?: string;
  }): Promise<{ object: { id: string } }> {
    return postJson(this.base(), "/business/intent", opts, this.adminToken);
  }

  async offerTransaction(opts: {
    transactionId: string;
    attestationRef: string;
    paymentMethodId: string;
    peerUrl: string;
    peerDid: string;
    amountMinor: number;
    currency: string;
    label?: string;
    subjectId?: string;
    stripeSecretKey?: string;
    encrypt?: boolean;
  }): Promise<{ transaction: { phase: string } }> {
    return postJson(this.base(), "/transactions/offer", opts, this.adminToken);
  }

  async syncBusinessCatalog(
    items: BusinessCatalogItemValue[],
  ): Promise<{ catalog: unknown[] }> {
    return postJson(this.base(), "/business/catalog/sync", { items }, this.adminToken);
  }

  async syncBusinessContext(
    records: Array<{ category: "business-brand" | "business-policy"; label: string; value: string }>,
  ): Promise<{ brand: unknown[]; policy: unknown[] }> {
    return postJson(this.base(), "/business/context/sync", { records }, this.adminToken);
  }

  async syncBusinessKnowledge(
    documents: Array<{
      id?: string;
      title: string;
      category?: "policy" | "terms" | "faq" | "product" | "general";
      body: string;
    }>,
  ): Promise<{ documents: unknown[] }> {
    return postJson(this.base(), "/business/knowledge/sync", { documents }, this.adminToken);
  }

  async listRooms(): Promise<{
    hosted: Array<{
      roomId: string;
      hostDid: string;
      name: string;
      topic?: string;
      admission: string;
      moduleId?: string;
      maxMembers: number;
    }>;
    joined: Array<{
      roomId: string;
      hostUrl: string;
      descriptor: {
        roomId: string;
        hostDid: string;
        name: string;
        topic?: string;
        moduleId?: string;
      };
    }>;
  }> {
    return getJson(this.base(), "/rooms", this.adminToken);
  }

  async getRoom(roomId: string): Promise<{
    descriptor: {
      roomId: string;
      hostDid: string;
      name: string;
      topic?: string;
      moduleId?: string;
      admission: string;
    };
    memberCount: number;
  }> {
    return getJson(this.base(), `/rooms/${encodeURIComponent(roomId)}`, this.adminToken);
  }

  async listRoomMembers(roomId: string): Promise<{
    members: Array<{ did: string; name?: string; endpoint?: string; joinedAt: string }>;
  }> {
    return getJson(this.base(), `/rooms/${encodeURIComponent(roomId)}/members`, this.adminToken);
  }

  async listRoomMessages(
    roomId: string,
    afterSeq = 0,
  ): Promise<{
    messages: Array<{
      seq: number;
      roomId: string;
      senderDid: string;
      kind: "message" | "activity";
      text?: string;
      activityKind?: string;
      at: string;
    }>;
  }> {
    return getJson(
      this.base(),
      `/rooms/${encodeURIComponent(roomId)}/messages?after=${afterSeq}`,
      this.adminToken,
    );
  }

  async joinRemoteRoom(opts: {
    hostUrl: string;
    roomId: string;
    memberName?: string;
  }): Promise<{ joined: string; descriptor: { roomId: string; name: string; moduleId?: string } | null }> {
    return postJson(this.base(), "/rooms/join-remote", opts, this.adminToken);
  }

  async leaveRoom(roomId: string): Promise<{ left: string }> {
    return postJson(this.base(), `/rooms/${encodeURIComponent(roomId)}/leave`, {}, this.adminToken);
  }

  async syncContacts(
    contacts: Array<{
      did: string;
      endpoint: string;
      name?: string;
      handle?: string;
      kind?: AgentContact["kind"];
      source?: AgentContact["source"];
      blocked?: boolean;
      muted?: boolean;
      standingDisclosure?: string[];
    }>,
  ): Promise<{ synced: number }> {
    const body = await postJson<{ synced: number }>(
      this.base(),
      "/contacts/sync",
      { contacts },
      this.adminToken,
    );
    return body;
  }

  async sendRoomMessage(opts: {
    roomId: string;
    text?: string;
    kind?: "message" | "activity";
    activityKind?: string;
    payload?: Record<string, unknown>;
  }): Promise<{ message?: { seq: number; text?: string }; pending?: boolean }> {
    return postJson(this.base(), `/rooms/${encodeURIComponent(opts.roomId)}/send`, opts, this.adminToken);
  }

  async roomStats(roomId: string): Promise<{
    stats: { present: number; joinsToday: number; messagesToday: number; activities: Record<string, number> };
  }> {
    return getJson(this.base(), `/rooms/${encodeURIComponent(roomId)}/stats`, this.adminToken);
  }
}

export type { VerifiedContactInvite };
