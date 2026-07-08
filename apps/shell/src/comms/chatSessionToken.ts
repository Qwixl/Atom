import type { CommsAgentConfig } from "./types.js";
import { assertProductionAgentUrl } from "../productionGuard.js";

/** In-memory scoped token for Chat connector reads (M21.4). Never persisted. */
let chatSessionToken: string | null = null;

export function getChatSessionToken(): string | null {
  return chatSessionToken;
}

export function setChatSessionToken(token: string | null): void {
  chatSessionToken = token?.trim() || null;
}

export async function mintChatSessionToken(config: CommsAgentConfig): Promise<string | null> {
  const adminToken = config.adminToken?.trim();
  if (!adminToken) return null;
  assertProductionAgentUrl(config.adminUrl);
  const resp = await fetch(`${config.adminUrl.replace(/\/$/, "")}/admin/session-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scopes: ["connector:read"], ttlSeconds: 900 }),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { token?: string };
  return body.token?.trim() || null;
}

/** Mint + store a fresh read-scoped session token (F6-4 / M21.4). */
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
