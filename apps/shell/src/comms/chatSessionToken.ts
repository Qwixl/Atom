import type { CommsAgentConfig } from "./types.js";
import { assertProductionAgentUrl } from "../productionGuard.js";
import { usesSupabaseHostedAuth } from "../hostConfig.js";
import { mintHostedAgentSession } from "./hostedAgentSession.js";

/** Scopes for Chat + connector reads (M21.4 / AS-09 interim). */
export const CHAT_SESSION_SCOPES = ["connector:read", "chat:agui"] as const;

/** In-memory scoped token for Chat + connector reads. Never persisted. */
let chatSessionToken: string | null = null;

export function getChatSessionToken(): string | null {
  return chatSessionToken;
}

export function setChatSessionToken(token: string | null): void {
  chatSessionToken = token?.trim() || null;
}

async function mintViaAgentAdmin(config: CommsAgentConfig): Promise<string | null> {
  const adminToken = config.adminToken?.trim();
  if (!adminToken) return null;
  assertProductionAgentUrl(config.adminUrl);
  const resp = await fetch(`${config.adminUrl.replace(/\/$/, "")}/admin/session-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scopes: [...CHAT_SESSION_SCOPES], ttlSeconds: 900 }),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { token?: string };
  return body.token?.trim() || null;
}

/**
 * Mint a short-lived session for AG-UI Chat + connector reads.
 * Hosted: prefer control-plane mint (admin token stays server-side).
 * Self-host / fallback: mint with the browser-held admin bearer.
 */
export async function mintChatSessionToken(config: CommsAgentConfig): Promise<string | null> {
  if (usesSupabaseHostedAuth()) {
    const hosted = await mintHostedAgentSession({
      scopes: [...CHAT_SESSION_SCOPES],
      ttlSeconds: 900,
    });
    if (hosted) return hosted;
  }
  return mintViaAgentAdmin(config);
}

/** Mint + store a fresh scoped session token (F6-4 / M21.4). */
export async function refreshChatSessionToken(config: CommsAgentConfig): Promise<string | null> {
  const token = await mintChatSessionToken(config);
  setChatSessionToken(token);
  return token;
}

export function commsClientAuth(config: CommsAgentConfig): {
  readToken?: string;
  adminToken?: string;
} {
  return {
    readToken: getChatSessionToken() ?? config.adminToken,
    adminToken: config.adminToken,
  };
}
