import type { CommsAgentConfig } from "./types.js";
import { assertProductionAgentUrl } from "../productionGuard.js";
import { usesSupabaseHostedAuth } from "../hostConfig.js";
import { mintHostedAgentSession } from "./hostedAgentSession.js";

/** Scopes for hosted owner runtime (AS-09 / M21.4). Never includes export or session mint. */
export const CHAT_SESSION_SCOPES = ["owner:runtime", "connector:read", "chat:agui"] as const;

/** Match agent-backend DEFAULT_TTL (15m). Refreshed before expiry so mid-chat does not 401. */
export const CHAT_SESSION_TTL_SECONDS = 900;

/** Remint when fewer than this many ms remain (or token already expired). */
export const CHAT_SESSION_REFRESH_SKEW_MS = 120_000;

const SESSION_PREFIX = "atom.st1.";

/** In-memory scoped token for Chat + connector reads. Never persisted. */
let chatSessionToken: string | null = null;

type SessionListener = (token: string | null) => void;
const listeners = new Set<SessionListener>();

export function getChatSessionToken(): string | null {
  return chatSessionToken;
}

export function setChatSessionToken(token: string | null): void {
  chatSessionToken = token?.trim() || null;
  for (const listener of listeners) {
    listener(chatSessionToken);
  }
}

/** Notify when the in-memory session bearer changes (panels + AG-UI). */
export function subscribeChatSessionToken(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function decodeBase64UrlJson(body: string): unknown {
  const padded = body.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((body.length + 3) % 4);
  const json = atob(padded);
  return JSON.parse(json) as unknown;
}

/**
 * Read `exp` from an atom.st1 payload without verifying the HMAC.
 * Used only to schedule refresh; the agent still validates signatures.
 */
export function peekChatSessionExpiryMs(token: string | null | undefined): number | null {
  const value = token?.trim();
  if (!value?.startsWith(SESSION_PREFIX)) return null;
  const rest = value.slice(SESSION_PREFIX.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  try {
    const payload = decodeBase64UrlJson(rest.slice(0, dot)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

export function chatSessionNeedsRefresh(
  token: string | null | undefined,
  nowMs = Date.now(),
  skewMs = CHAT_SESSION_REFRESH_SKEW_MS,
): boolean {
  if (!token?.trim()) return true;
  const exp = peekChatSessionExpiryMs(token);
  if (exp == null) return false;
  return exp - nowMs <= skewMs;
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
    body: JSON.stringify({ scopes: [...CHAT_SESSION_SCOPES], ttlSeconds: CHAT_SESSION_TTL_SECONDS }),
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
      ttlSeconds: CHAT_SESSION_TTL_SECONDS,
    });
  }
  return mintViaAgentAdmin(config);
}

/**
 * Force a new session token. Returns null on mint failure (does not keep an expired bearer).
 */
export async function remintChatSessionToken(config: CommsAgentConfig): Promise<string | null> {
  const token = await mintChatSessionToken(config);
  if (!token) return null;
  setChatSessionToken(token);
  return token;
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

/**
 * Ensure the in-memory session is present and not near expiry.
 * Idempotent — skips mint when the current token still has skew headroom.
 */
export async function ensureFreshChatSessionToken(
  config: CommsAgentConfig,
): Promise<string | null> {
  const current = getChatSessionToken();
  if (!chatSessionNeedsRefresh(current)) return current;
  const reminted = await remintChatSessionToken(config);
  return reminted ?? getChatSessionToken();
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
