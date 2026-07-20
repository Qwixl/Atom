import type { CommsAgentConfig } from "./types.js";
import { assertProductionAgentUrl } from "../productionGuard.js";
import { usesSupabaseHostedAuth } from "../hostConfig.js";
import { mintHostedAgentSession } from "./hostedAgentSession.js";

/** Scopes for hosted owner runtime (AS-09 / M21.4). Never includes export or session mint. */
export const CHAT_SESSION_SCOPES = ["owner:runtime", "connector:read", "chat:agui"] as const;

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
 * Hosted: control-plane mint only (admin token stays server-side).
 * Self-host: mint with the browser-held admin bearer.
 */
export async function mintChatSessionToken(config: CommsAgentConfig): Promise<string | null> {
  if (usesSupabaseHostedAuth()) {
    return mintHostedAgentSession({
      scopes: [...CHAT_SESSION_SCOPES],
      ttlSeconds: 900,
    });
  }
  return mintViaAgentAdmin(config);
}

/**
 * Mint + store a fresh scoped session token (F6-4 / M21.4).
 * On mint failure, keep any existing in-memory token (do not wipe a good connect session).
 */
export async function refreshChatSessionToken(config: CommsAgentConfig): Promise<string | null> {
  const token = await mintChatSessionToken(config);
  if (token) {
    setChatSessionToken(token);
    return token;
  }
  return getChatSessionToken();
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
