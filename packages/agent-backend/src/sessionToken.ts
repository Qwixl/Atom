import { createHmac, timingSafeEqual } from "node:crypto";

/** v1 session scopes — expand deliberately; session tokens never grant admin write routes. */
export type SessionScope = "connector:read";

export interface SessionTokenPayload {
  v: 1;
  exp: number;
  scopes: SessionScope[];
}

const PREFIX = "atom.st1.";
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;

function sign(adminSecret: string, body: string): string {
  return createHmac("sha256", adminSecret).update(body).digest("base64url");
}

export function mintSessionToken(
  adminSecret: string,
  options: { scopes: SessionScope[]; ttlMs?: number },
): string {
  const ttlMs = Math.min(Math.max(options.ttlMs ?? DEFAULT_TTL_MS, 60_000), MAX_TTL_MS);
  const payload: SessionTokenPayload = {
    v: 1,
    exp: Date.now() + ttlMs,
    scopes: options.scopes,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${PREFIX}${body}.${sign(adminSecret, body)}`;
}

export function verifySessionToken(adminSecret: string, token: string): SessionTokenPayload | null {
  if (!token.startsWith(PREFIX)) return null;
  const rest = token.slice(PREFIX.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  const expected = sign(adminSecret, body);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionTokenPayload;
    if (payload.v !== 1 || !Array.isArray(payload.scopes) || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseSessionTtlMs(ttlSeconds: unknown): number {
  if (typeof ttlSeconds !== "number" || !Number.isFinite(ttlSeconds)) return DEFAULT_TTL_MS;
  return Math.min(Math.max(Math.floor(ttlSeconds * 1000), 60_000), MAX_TTL_MS);
}
