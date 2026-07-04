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
import type { InboxEntryWire } from "./types.js";

async function postJson<T>(
  adminUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(`${adminUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${resp.status})`);
  }
  return resp.json() as Promise<T>;
}

export class CommsAgentClient {
  constructor(private readonly adminUrl: string) {}

  private base(): string {
    return this.adminUrl.replace(/\/$/, "");
  }

  async health(): Promise<{ ok: boolean; did: string; inbox: number; mlsPeers: string[] }> {
    const resp = await fetch(`${this.base()}/health`);
    if (!resp.ok) throw new Error(`Agent health check failed (${resp.status})`);
    return resp.json() as Promise<{ ok: boolean; did: string; inbox: number; mlsPeers: string[] }>;
  }

  async inbox(): Promise<InboxEntryWire[]> {
    const resp = await fetch(`${this.base()}/inbox`);
    if (!resp.ok) throw new Error(`Inbox fetch failed (${resp.status})`);
    const body = (await resp.json()) as { entries?: InboxEntryWire[] };
    return body.entries ?? [];
  }

  async createInvite(ttlSeconds?: number): Promise<{ token: string; issuerDid: string }> {
    const resp = await fetch(`${this.base()}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ttlSeconds ? { ttlSeconds } : {}),
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Invite failed (${resp.status})`);
    }
    return resp.json() as Promise<{ token: string; issuerDid: string }>;
  }

  async connectInvite(invite: string): Promise<{ connected: string }> {
    const resp = await fetch(`${this.base()}/mls/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite: invite.trim() }),
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `MLS connect failed (${resp.status})`);
    }
    return resp.json() as Promise<{ connected: string }>;
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
    await postJson(this.base(), "/send", {
      peerUrl: opts.peerUrl,
      peerDid: opts.peerDid,
      message,
      encrypt: opts.encrypt,
    });
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
    await postJson(this.base(), "/coordination/scheduling-response", {
      peerUrl: opts.peerUrl,
      peerDid: opts.peerDid,
      proposalId: opts.proposalId,
      response: opts.response,
      slotId: opts.slotId,
      encrypt: opts.encrypt ?? true,
    });
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
    await postJson(this.base(), "/coordination/rsvp-response", {
      peerUrl: opts.peerUrl,
      peerDid: opts.peerDid,
      rsvpId: opts.rsvpId,
      response: opts.response,
      encrypt: opts.encrypt ?? true,
    });
  }

  async calendarStatus(): Promise<{ configured: boolean; protocol: string; provider: string }> {
    const resp = await fetch(`${this.base()}/calendar/status`);
    if (!resp.ok) throw new Error(`Calendar status failed (${resp.status})`);
    return resp.json() as Promise<{ configured: boolean; protocol: string; provider: string }>;
  }

  async createCalendarEvent(opts: {
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
    accessToken?: string;
  }): Promise<{ created: { uid: string; href: string } }> {
    return postJson(this.base(), "/calendar/events", opts);
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
    return postJson(this.base(), "/actions/reserve", opts);
  }

  async confirmTransaction(opts: {
    transactionId: string;
    attestationRef: string;
    peerUrl: string;
    peerDid: string;
    encrypt?: boolean;
  }): Promise<{ transaction: { phase: string } }> {
    return postJson(this.base(), "/transactions/confirm", opts);
  }

  async declineTransaction(opts: {
    transactionId: string;
    attestationRef?: string;
    note?: string;
    peerUrl: string;
    peerDid: string;
    encrypt?: boolean;
  }): Promise<{ transaction: { phase: string } }> {
    return postJson(this.base(), "/transactions/decline", opts);
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
    return postJson(this.base(), "/business/intent", opts);
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
    return postJson(this.base(), "/transactions/offer", opts);
  }

  async syncBusinessCatalog(
    items: BusinessCatalogItemValue[],
  ): Promise<{ catalog: unknown[] }> {
    return postJson(this.base(), "/business/catalog/sync", { items });
  }
}

export type { VerifiedContactInvite };
