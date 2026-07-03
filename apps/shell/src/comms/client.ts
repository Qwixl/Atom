import {
  COMMS_MESSAGE_PURPOSE,
  COMMS_MESSAGE_SCHEMA,
  type VerifiedContactInvite,
} from "@qwixl/a2a-transport";
import type { UnsignedDataObject } from "@qwixl/protocol";
import type { InboxEntryWire } from "./types.js";

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
    const resp = await fetch(`${this.base()}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        peerUrl: opts.peerUrl,
        peerDid: opts.peerDid,
        message,
        encrypt: opts.encrypt,
      }),
    });
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Send failed (${resp.status})`);
    }
  }
}

export type { VerifiedContactInvite };
