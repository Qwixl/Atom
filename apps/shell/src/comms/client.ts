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

export type CommsAgentAuth =
  | string
  | {
      readToken?: string;
      adminToken?: string;
    };

function resolveAuthToken(auth: CommsAgentAuth | undefined, forWrite: boolean): string | undefined {
  if (typeof auth === "string") return auth.trim() || undefined;
  const token = forWrite ? auth?.adminToken : auth?.readToken ?? auth?.adminToken;
  return token?.trim() || undefined;
}

function adminHeaders(auth: CommsAgentAuth | undefined, forWrite = false): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = resolveAuthToken(auth, forWrite);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function postJson<T>(
  adminUrl: string,
  path: string,
  body: Record<string, unknown>,
  auth?: CommsAgentAuth,
  forWrite = false,
): Promise<T> {
  assertProductionAgentUrl(adminUrl);
  const resp = await fetch(`${adminUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: adminHeaders(auth, forWrite),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(formatAgentError(new Error(err.error ?? `Request failed (${resp.status})`)));
  }
  return resp.json() as Promise<T>;
}

async function getJson<T>(
  adminUrl: string,
  path: string,
  auth?: CommsAgentAuth,
  forWrite = false,
): Promise<T> {
  assertProductionAgentUrl(adminUrl);
  const headers: Record<string, string> = {};
  const token = resolveAuthToken(auth, forWrite);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
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
    private readonly auth?: CommsAgentAuth,
  ) {}

  private bearer(forWrite = false): string | undefined {
    return resolveAuthToken(this.auth, forWrite);
  }

  private base(): string {
    return this.adminUrl.replace(/\/$/, "");
  }

  async health(): Promise<{ ok: boolean; did: string; inbox: number; mlsPeers: string[] }> {
    return getJson(this.base(), "/health", this.auth, true);
  }

  async inbox(): Promise<InboxEntryWire[]> {
    const body = await getJson<{ entries?: InboxEntryWire[] }>(this.base(), "/inbox", this.auth, true);
    return body.entries ?? [];
  }

  async createInvite(ttlSeconds?: number): Promise<{ token: string; issuerDid: string }> {
    return postJson(
      this.base(),
      "/invite",
      ttlSeconds ? { ttlSeconds } : {},
      this.auth,
      true,
    );
  }

  async connectInvite(invite: string): Promise<{ connected: string }> {
    return postJson(this.base(), "/mls/connect", { invite: invite.trim() }, this.auth, true);
  }

  async connectPeer(peerUrl: string, peerDid?: string): Promise<{ connected: string }> {
    return postJson(
      this.base(),
      "/mls/connect",
      { peerUrl: peerUrl.trim(), ...(peerDid?.trim() ? { peerDid: peerDid.trim() } : {}) },
      this.auth,
      true,
    );
  }

  async resolveDiscoverEntry(entry: BusinessIndexEntry): Promise<ResolvedDiscoverTarget> {
    const body = await postJson<{ resolved: ResolvedDiscoverTarget }>(
      this.base(),
      "/discover/resolve",
      entry as unknown as Record<string, unknown>,
      this.auth,
      true,
    );
    return body.resolved;
  }

  async filterAvailableDiscoverEntries(
    entries: BusinessIndexEntry[],
  ): Promise<Array<{ entry: BusinessIndexEntry; resolved: ResolvedDiscoverTarget }>> {
    const body = await postJson<{
      available: Array<{ entry: BusinessIndexEntry; resolved: ResolvedDiscoverTarget }>;
    }>(this.base(), "/discover/availability", { entries }, this.auth, true);
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
    return postJson(this.base(), "/discover/search", opts, this.auth, true);
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
      this.auth,
      true,
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
      this.auth,
      true,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendSchedulingResponse(opts: {
    peerUrl: string;
    peerDid: string;
    proposalId: string;
    response: SchedulingResponseKind;
    slotId?: string;
    title?: string;
    start?: string;
    end?: string;
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
        title: opts.title,
        start: opts.start,
        end: opts.end,
        encrypt: opts.encrypt ?? true,
      },
      this.auth,
      true,
    );
  }

  async getCalendarPublishFeed(): Promise<{
    eventCount: number;
    feedUrl: string;
    webcalUrl: string;
    tokenHint: string;
  }> {
    return getJson(this.base(), "/calendar/feed", this.auth, true);
  }

  async rotateCalendarPublishFeedToken(): Promise<{
    eventCount: number;
    feedUrl: string;
    webcalUrl: string;
    tokenHint: string;
  }> {
    return postJson(this.base(), "/calendar/feed/rotate-token", {}, this.auth, true);
  }

  async syncCalendarPublishFeed(): Promise<{ added: number; eventCount: number }> {
    return postJson(this.base(), "/calendar/feed/sync-inbox", {}, this.auth, true);
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
      this.auth,
      true,
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
      this.auth,
      true,
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
      this.auth,
      true,
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
      this.auth,
      true,
    );
  }

  async sendSplitBill(opts: {
    peerUrl: string;
    peerDid: string;
    splitId: string;
    label: string;
    totalMinor: number;
    currency: string;
    splitCount: number;
    shareMinor: number;
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/commerce/split-bill",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        splitId: opts.splitId,
        label: opts.label,
        totalMinor: opts.totalMinor,
        currency: opts.currency,
        splitCount: opts.splitCount,
        shareMinor: opts.shareMinor,
        encrypt: opts.encrypt ?? true,
      },
      this.auth,
      true,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendSharedList(opts: {
    peerUrl: string;
    peerDid: string;
    listId: string;
    title: string;
    items: Array<{ id: string; text: string; done: boolean }>;
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/coordination/shared-list",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        listId: opts.listId,
        title: opts.title,
        items: opts.items,
        encrypt: opts.encrypt ?? true,
      },
      this.auth,
      true,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendLocationPin(opts: {
    peerUrl: string;
    peerDid: string;
    pinId: string;
    label: string;
    lat: number;
    lng: number;
    note?: string;
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/coordination/location-pin",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        pinId: opts.pinId,
        label: opts.label,
        lat: opts.lat,
        lng: opts.lng,
        note: opts.note,
        encrypt: opts.encrypt ?? true,
      },
      this.auth,
      true,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendSharedListUpdate(opts: {
    peerUrl: string;
    peerDid: string;
    listId: string;
    title?: string;
    items: Array<{ id: string; text: string; done: boolean }>;
    encrypt?: boolean;
  }): Promise<void> {
    await postJson(
      this.base(),
      "/coordination/shared-list-update",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        listId: opts.listId,
        title: opts.title,
        items: opts.items,
        encrypt: opts.encrypt ?? true,
      },
      this.auth,
      true,
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
      this.auth,
      true,
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
      this.auth,
      true,
    );
  }

  async sendBsState(opts: {
    peerUrl: string;
    peerDid: string;
    gameId: string;
    phase: "setup" | "battle" | "won";
    turn: "A" | "B";
    commitA?: string;
    commitB?: string;
    shots: Array<{ cell: number; shooter: "A" | "B"; hit: boolean }>;
    winner?: "A" | "B";
    publicState?: Record<string, unknown>;
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/coordination/bs-state",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        gameId: opts.gameId,
        phase: opts.phase,
        turn: opts.turn,
        commitA: opts.commitA,
        commitB: opts.commitB,
        shots: opts.shots,
        winner: opts.winner,
        publicState: opts.publicState,
        encrypt: opts.encrypt ?? true,
      },
      this.auth,
      true,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendBsMove(opts: {
    peerUrl: string;
    peerDid: string;
    gameId: string;
    player: "A" | "B";
    action: "place" | "fire";
    cells?: number[];
    cell?: number;
    encrypt?: boolean;
  }): Promise<{ objectId: string }> {
    const result = await postJson<{ sent?: { objectId?: string } }>(
      this.base(),
      "/coordination/bs-move",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        gameId: opts.gameId,
        player: opts.player,
        action: opts.action,
        cells: opts.cells,
        cell: opts.cell,
        encrypt: opts.encrypt ?? true,
      },
      this.auth,
      true,
    );
    return { objectId: result.sent?.objectId ?? crypto.randomUUID() };
  }

  async sendBsShot(opts: {
    peerUrl: string;
    peerDid: string;
    gameId: string;
    cell: number;
    shooter: "A" | "B";
    hit?: boolean;
    encrypt?: boolean;
  }): Promise<void> {
    await postJson(
      this.base(),
      "/coordination/bs-shot",
      {
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        gameId: opts.gameId,
        cell: opts.cell,
        shooter: opts.shooter,
        hit: opts.hit,
        encrypt: opts.encrypt ?? true,
      },
      this.auth,
      true,
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
    return getJson(this.base(), `/connectors/${encodeURIComponent(connectorId)}/status`, this.auth);
  }

  async invokeConnector(
    connectorId: string,
    operation: string,
    input: Record<string, unknown>,
    approvalRef?: string,
  ): Promise<{ operation: string; result: unknown; meta?: { fetchedAt: string; cacheHit: boolean; ttlMs: number } }> {
    return postJson(
      this.base(),
      `/connectors/${encodeURIComponent(connectorId)}/invoke`,
      { operation, input, approvalRef },
      this.auth,
    );
  }

  async setConnectorToken(
    connectorId: string,
    token: string,
    approvalRef?: string,
  ): Promise<{ connectorId: string; configured: boolean }> {
    return postJson(
      this.base(),
      `/connectors/${encodeURIComponent(connectorId)}/token`,
      { token, approvalRef },
      this.auth,
      true,
    );
  }

  async clearConnectorToken(connectorId: string, approvalRef?: string): Promise<{ connectorId: string; removed: boolean }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const bearer = this.bearer(true);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const resp = await fetch(`${this.base()}/connectors/${encodeURIComponent(connectorId)}/token${query}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ connectorId: string; removed: boolean }>;
  }

  async saveTrelloCredentials(input: {
    apiKey: string;
    token: string;
    approvalRef?: string;
  }): Promise<{ connectorId: string; configured: boolean }> {
    return postJson(this.base(), "/connectors/trello/credentials", input, this.auth, true);
  }

  async clearTrelloCredentials(approvalRef?: string): Promise<{ connectorId: string; removed: boolean }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const bearer = this.bearer(true);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const resp = await fetch(`${this.base()}/connectors/trello/credentials${query}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ connectorId: string; removed: boolean }>;
  }

  async saveHomeAssistantCredentials(input: {
    baseUrl: string;
    accessToken: string;
    approvalRef?: string;
  }): Promise<{ connectorId: string; configured: boolean }> {
    return postJson(this.base(), "/connectors/home-assistant/credentials", input, this.auth, true);
  }

  async clearHomeAssistantCredentials(approvalRef?: string): Promise<{ connectorId: string; removed: boolean }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const bearer = this.bearer(true);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const resp = await fetch(`${this.base()}/connectors/home-assistant/credentials${query}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ connectorId: string; removed: boolean }>;
  }

  async saveBlueskyCredentials(input: {
    handle: string;
    appPassword: string;
    pdsUrl?: string;
    approvalRef?: string;
  }): Promise<{ connectorId: string; configured: boolean }> {
    return postJson(this.base(), "/connectors/bluesky/credentials", input, this.auth, true);
  }

  async clearBlueskyCredentials(approvalRef?: string): Promise<{ connectorId: string; removed: boolean }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const bearer = this.bearer(true);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const resp = await fetch(`${this.base()}/connectors/bluesky/credentials${query}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ connectorId: string; removed: boolean }>;
  }

  async saveMastodonCredentials(input: {
    instanceUrl: string;
    accessToken: string;
    approvalRef?: string;
  }): Promise<{ connectorId: string; configured: boolean }> {
    return postJson(this.base(), "/connectors/mastodon/credentials", input, this.auth, true);
  }

  async clearMastodonCredentials(approvalRef?: string): Promise<{ connectorId: string; removed: boolean }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const bearer = this.bearer(true);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const resp = await fetch(`${this.base()}/connectors/mastodon/credentials${query}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ connectorId: string; removed: boolean }>;
  }

  async createTodoistTask(
    content: string,
    opts?: { projectId?: string; dueString?: string },
    approvalRef?: string,
  ): Promise<{ task: { id: string; content: string } }> {
    return postJson(
      this.base(),
      "/connectors/todoist/tasks",
      { content, projectId: opts?.projectId, dueString: opts?.dueString, approvalRef },
      this.auth,
      true,
    );
  }

  async addCalDavAccount(
    input: { label?: string; calendarUrl: string; username: string; password: string },
    approvalRef?: string,
  ): Promise<{ account: { id: string; label: string } }> {
    return postJson(this.base(), "/connectors/caldav/accounts", { ...input, approvalRef }, this.auth, true);
  }

  async removeCalDavAccount(accountId: string, approvalRef?: string): Promise<{ removed: boolean; accountId: string }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const bearer = this.bearer(true);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const resp = await fetch(`${this.base()}/connectors/caldav/accounts/${encodeURIComponent(accountId)}${query}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ removed: boolean; accountId: string }>;
  }

  async createCalDavEvent(
    input: { accountId: string; summary: string; start: string; end: string; description?: string },
    approvalRef?: string,
  ): Promise<{ event: { uid: string; summary: string } }> {
    return postJson(this.base(), "/connectors/caldav/events", { ...input, approvalRef }, this.auth, true);
  }

  async addCardDavAccount(
    input: { label?: string; addressBookUrl: string; username: string; password: string },
    approvalRef?: string,
  ): Promise<{ account: { id: string; label: string } }> {
    return postJson(this.base(), "/connectors/carddav/accounts", { ...input, approvalRef }, this.auth, true);
  }

  async removeCardDavAccount(accountId: string, approvalRef?: string): Promise<{ removed: boolean; accountId: string }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const bearer = this.bearer(true);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const resp = await fetch(`${this.base()}/connectors/carddav/accounts/${encodeURIComponent(accountId)}${query}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ removed: boolean; accountId: string }>;
  }

  async listMcpServers(): Promise<{
    servers: Array<{
      id: string;
      label: string;
      transport: "stdio" | "streamable-http";
      command?: string;
      args: string[];
      cwd?: string;
      url?: string;
      hasAuthHeaders: boolean;
      allowedTools: string[];
      enabled: boolean;
      trusted: boolean;
      trustedAt?: number;
      addedAt: number;
    }>;
  }> {
    return getJson(this.base(), "/mcp/servers", this.auth);
  }

  async addMcpServer(input: {
    label: string;
    transport?: "stdio" | "streamable-http";
    command?: string;
    args?: string[] | string;
    cwd?: string;
    url?: string;
    authHeader?: string;
    allowedTools?: string[];
    approvalRef?: string;
  }): Promise<{ server: { id: string; label: string } }> {
    return postJson(this.base(), "/mcp/servers", input, this.auth, true);
  }

  async removeMcpServer(serverId: string, approvalRef?: string): Promise<{ ok: boolean }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const token = this.bearer(true);
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(`${this.base()}/mcp/servers/${encodeURIComponent(serverId)}${query}`, {
      method: "DELETE",
      headers,
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ ok: boolean }>;
  }

  async listMcpTools(serverId: string): Promise<{ serverId: string; tools: Array<{ name: string; description?: string }> }> {
    return getJson(this.base(), `/mcp/servers/${encodeURIComponent(serverId)}/tools`, this.auth);
  }

  async invokeMcpTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ serverId: string; toolName: string; result: unknown }> {
    return postJson(
      this.base(),
      `/mcp/servers/${encodeURIComponent(serverId)}/tools/call`,
      { toolName, arguments: args },
      this.auth,
    );
  }

  async setMcpAllowedTools(
    serverId: string,
    allowedTools: string[],
    approvalRef?: string,
  ): Promise<{ server: { id: string; allowedTools: string[] } | null }> {
    return postJson(
      this.base(),
      `/mcp/servers/${encodeURIComponent(serverId)}/allowed-tools`,
      { allowedTools, approvalRef },
      this.auth,
      true,
    );
  }

  async trustMcpServer(
    serverId: string,
    approvalRef?: string,
  ): Promise<{ server: { id: string; trusted: boolean; trustedAt?: number } }> {
    return postJson(
      this.base(),
      `/mcp/servers/${encodeURIComponent(serverId)}/trust`,
      { approvalRef },
      this.auth,
      true,
    );
  }

  async addWebcalFeed(url: string, label?: string, approvalRef?: string): Promise<{ feed: { id: string; label: string } }> {
    return postJson(this.base(), "/connectors/webcal/feeds", { url, label, approvalRef }, this.auth, true);
  }

  async removeWebcalFeed(feedId: string, approvalRef?: string): Promise<{ removed: boolean; feedId: string }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const token = this.bearer(true);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const resp = await fetch(
      `${this.base()}/connectors/webcal/feeds/${encodeURIComponent(feedId)}${query}`,
      { method: "DELETE", headers },
    );
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ removed: boolean; feedId: string }>;
  }

  async addRssFeed(url: string, label?: string, approvalRef?: string): Promise<{ feed: { id: string; label: string } }> {
    return postJson(this.base(), "/connectors/rss/feeds", { url, label, approvalRef }, this.auth, true);
  }

  async removeRssFeed(feedId: string, approvalRef?: string): Promise<{ removed: boolean; feedId: string }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const token = this.bearer(true);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const resp = await fetch(
      `${this.base()}/connectors/rss/feeds/${encodeURIComponent(feedId)}${query}`,
      { method: "DELETE", headers },
    );
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ removed: boolean; feedId: string }>;
  }

  async addBookmark(url: string, label?: string, approvalRef?: string): Promise<{ bookmark: { id: string; label: string } }> {
    return postJson(this.base(), "/connectors/bookmarks", { url, label, approvalRef }, this.auth, true);
  }

  async removeBookmark(bookmarkId: string, approvalRef?: string): Promise<{ removed: boolean; bookmarkId: string }> {
    const query = approvalRef?.trim() ? `?approvalRef=${encodeURIComponent(approvalRef.trim())}` : "";
    const headers: Record<string, string> = {};
    const token = this.bearer(true);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const resp = await fetch(
      `${this.base()}/connectors/bookmarks/${encodeURIComponent(bookmarkId)}${query}`,
      { method: "DELETE", headers },
    );
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Request failed (${resp.status})`);
    }
    return resp.json() as Promise<{ removed: boolean; bookmarkId: string }>;
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
    return postJson(this.base(), "/actions/reserve", opts, this.auth, true);
  }

  async confirmTransaction(opts: {
    transactionId: string;
    attestationRef: string;
    peerUrl: string;
    peerDid: string;
    encrypt?: boolean;
  }): Promise<{ transaction: { phase: string } }> {
    return postJson(this.base(), "/transactions/confirm", opts, this.auth, true);
  }

  async declineTransaction(opts: {
    transactionId: string;
    attestationRef?: string;
    note?: string;
    peerUrl: string;
    peerDid: string;
    encrypt?: boolean;
  }): Promise<{ transaction: { phase: string } }> {
    return postJson(this.base(), "/transactions/decline", opts, this.auth, true);
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
    return postJson(this.base(), "/business/intent", opts, this.auth, true);
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
    return postJson(this.base(), "/transactions/offer", opts, this.auth, true);
  }

  async syncBusinessCatalog(
    items: BusinessCatalogItemValue[],
  ): Promise<{ catalog: unknown[] }> {
    return postJson(this.base(), "/business/catalog/sync", { items }, this.auth, true);
  }

  async getBusinessStoreStatus(): Promise<{
    shopify?: { configured: boolean; configuredAt?: number };
    woocommerce?: { configured: boolean; configuredAt?: number };
    square?: { configured: boolean; environment?: string; configuredAt?: number };
  }> {
    return getJson(this.base(), "/business/store/status", this.auth, true);
  }

  async saveShopifyStore(input: {
    shop: string;
    accessToken: string;
    approvalRef?: string;
  }): Promise<{ configured: boolean }> {
    return postJson(this.base(), "/business/store/shopify", input, this.auth, true);
  }

  async saveWooCommerceStore(input: {
    storeUrl: string;
    consumerKey: string;
    consumerSecret: string;
    approvalRef?: string;
  }): Promise<{ configured: boolean }> {
    return postJson(this.base(), "/business/store/woocommerce", input, this.auth, true);
  }

  async importShopifyCatalog(input?: {
    limit?: number;
    syncKnowledge?: boolean;
    approvalRef?: string;
  }): Promise<{ importedCount: number; currency: string; catalog: unknown[] }> {
    return postJson(this.base(), "/business/catalog/import/shopify", input ?? {}, this.auth, true);
  }

  async importWooCommerceCatalog(input?: {
    limit?: number;
    currency?: string;
    syncKnowledge?: boolean;
    approvalRef?: string;
  }): Promise<{ importedCount: number; currency: string; catalog: unknown[] }> {
    return postJson(this.base(), "/business/catalog/import/woocommerce", input ?? {}, this.auth, true);
  }

  async saveSquareStore(input: {
    accessToken: string;
    environment?: "production" | "sandbox";
    approvalRef?: string;
  }): Promise<{ configured: boolean }> {
    return postJson(this.base(), "/business/store/square", input, this.auth, true);
  }

  async importSquareCatalog(input?: {
    limit?: number;
    syncKnowledge?: boolean;
    approvalRef?: string;
  }): Promise<{ importedCount: number; currency: string; catalog: unknown[] }> {
    return postJson(this.base(), "/business/catalog/import/square", input ?? {}, this.auth, true);
  }

  async syncBusinessContext(
    records: Array<{ category: "business-brand" | "business-policy"; label: string; value: string }>,
  ): Promise<{ brand: unknown[]; policy: unknown[] }> {
    return postJson(this.base(), "/business/context/sync", { records }, this.auth, true);
  }

  async syncBusinessKnowledge(
    documents: Array<{
      id?: string;
      title: string;
      category?: "policy" | "terms" | "faq" | "product" | "general";
      body: string;
    }>,
  ): Promise<{ documents: unknown[] }> {
    return postJson(this.base(), "/business/knowledge/sync", { documents }, this.auth, true);
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
    return getJson(this.base(), "/rooms", this.auth, true);
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
    return getJson(this.base(), `/rooms/${encodeURIComponent(roomId)}`, this.auth, true);
  }

  async listRoomMembers(roomId: string): Promise<{
    members: Array<{ did: string; name?: string; endpoint?: string; joinedAt: string }>;
  }> {
    return getJson(this.base(), `/rooms/${encodeURIComponent(roomId)}/members`, this.auth, true);
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
      this.auth,
      true,
    );
  }

  async joinRemoteRoom(opts: {
    hostUrl: string;
    roomId: string;
    memberName?: string;
  }): Promise<{ joined: string; descriptor: { roomId: string; name: string; moduleId?: string } | null }> {
    return postJson(this.base(), "/rooms/join-remote", opts, this.auth, true);
  }

  async leaveRoom(roomId: string): Promise<{ left: string }> {
    return postJson(this.base(), `/rooms/${encodeURIComponent(roomId)}/leave`, {}, this.auth, true);
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
      this.auth,
      true,
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
    return postJson(this.base(), `/rooms/${encodeURIComponent(opts.roomId)}/send`, opts, this.auth, true);
  }

  async roomStats(roomId: string): Promise<{
    stats: { present: number; joinsToday: number; messagesToday: number; activities: Record<string, number> };
  }> {
    return getJson(this.base(), `/rooms/${encodeURIComponent(roomId)}/stats`, this.auth, true);
  }

  async billingStatus(): Promise<{
    betaFree: boolean;
    platformFeeBps: number;
    stripeConfigured: boolean;
    connectOnboarding?: string;
  }> {
    return getJson(this.base(), "/billing/status", this.auth, true);
  }

  async getSpendPolicy(workspaceId: string): Promise<{
    policy: {
      workspaceId: string;
      currency: string;
      monthlyBudgetMinor: number;
      perTransactionCeilingMinor: number;
      chromeApprovalThresholdMinor: number;
      allowedCategories: string[];
      updatedAt: string;
    };
  }> {
    return getJson(this.base(), `/billing/spend-policy/${encodeURIComponent(workspaceId)}`, this.auth, true);
  }

  async saveSpendPolicy(policy: {
    workspaceId: string;
    currency?: string;
    monthlyBudgetMinor?: number;
    perTransactionCeilingMinor?: number;
    chromeApprovalThresholdMinor?: number;
    allowedCategories?: string[];
  }): Promise<{
    policy: {
      workspaceId: string;
      currency: string;
      monthlyBudgetMinor: number;
      perTransactionCeilingMinor: number;
      chromeApprovalThresholdMinor: number;
      allowedCategories: string[];
      updatedAt: string;
    };
  }> {
    return postJson(this.base(), "/billing/spend-policy", policy, this.auth, true);
  }

  async billingLedger(workspaceId: string): Promise<{
    entries: Array<{
      id: string;
      workspaceId: string;
      category: string;
      amountMinor: number;
      currency: string;
      description: string;
      recordedAt: string;
    }>;
  }> {
    return getJson(this.base(), `/billing/ledger/${encodeURIComponent(workspaceId)}`, this.auth, true);
  }
}

export type { VerifiedContactInvite };
