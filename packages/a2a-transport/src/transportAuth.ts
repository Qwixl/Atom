/**
 * Atom DID Bearer tokens for A2A transport authentication.
 *
 * A2A requires clients to authenticate using a scheme declared on the Agent
 * Card. Atom uses HTTP Bearer tokens whose payload is signed by the caller's
 * `did:key` Ed25519 key — no shared secret exchange, and the verifying key is
 * recovered from the DID itself.
 *
 * Token form: `atom.<base64url(payload)>.<base64url(signature)>`
 * Payload: `{ v: 1, did, aud, iat, exp }` — `aud` is the peer's public base URL.
 */

import {
  didToPublicKey,
  isDidKey,
  signBytes,
  stableStringify,
  verifyBytes,
  type AgentKeyPair,
} from "@qwixl/protocol";

export const ATOM_TRANSPORT_AUTH_SCHEME = "atomDidBearer";
export const ATOM_TRANSPORT_TOKEN_PREFIX = "atom.";
export const ATOM_TRANSPORT_TOKEN_TTL_MS = 5 * 60 * 1000;

export interface AtomTransportTokenPayload {
  v: 1;
  did: string;
  aud: string;
  iat: number;
  exp: number;
}

function base64urlFromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function bytesFromBase64url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

/** Normalise an audience URL to scheme + host (Atom agents are origin-rooted). */
export function normalizeTransportAudience(audience: string): string {
  const trimmed = audience.trim();
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

export async function mintAtomTransportToken(opts: {
  identity: AgentKeyPair;
  audience: string;
  now?: Date;
  ttlMs?: number;
}): Promise<string> {
  const now = opts.now ?? new Date();
  const ttlMs = opts.ttlMs ?? ATOM_TRANSPORT_TOKEN_TTL_MS;
  const payload: AtomTransportTokenPayload = {
    v: 1,
    did: opts.identity.did,
    aud: normalizeTransportAudience(opts.audience),
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor((now.getTime() + ttlMs) / 1000),
  };
  const body = stableStringify(payload);
  const bodyBytes = new TextEncoder().encode(body);
  const signature = await signBytes(opts.identity.privateKey, bodyBytes);
  return `${ATOM_TRANSPORT_TOKEN_PREFIX}${base64urlFromBytes(bodyBytes)}.${base64urlFromBytes(signature)}`;
}

export async function verifyAtomTransportToken(opts: {
  token: string;
  audience: string;
  now?: Date;
}): Promise<{ did: string }> {
  const raw = opts.token.trim();
  if (!raw.startsWith(ATOM_TRANSPORT_TOKEN_PREFIX)) {
    throw new Error("transport token: missing atom. prefix");
  }
  const rest = raw.slice(ATOM_TRANSPORT_TOKEN_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot <= 0 || dot === rest.length - 1) {
    throw new Error("transport token: malformed");
  }
  const bodyBytes = bytesFromBase64url(rest.slice(0, dot));
  const sigBytes = bytesFromBase64url(rest.slice(dot + 1));
  const body = new TextDecoder().decode(bodyBytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("transport token: payload is not JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("transport token: invalid payload");
  }
  const payload = parsed as Partial<AtomTransportTokenPayload>;
  if (
    payload.v !== 1 ||
    typeof payload.did !== "string" ||
    !isDidKey(payload.did) ||
    typeof payload.aud !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("transport token: invalid claims");
  }

  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (payload.exp < nowSec) {
    throw new Error("transport token: expired");
  }
  if (payload.iat > nowSec + 60) {
    throw new Error("transport token: not yet valid");
  }
  if (normalizeTransportAudience(payload.aud) !== normalizeTransportAudience(opts.audience)) {
    throw new Error("transport token: audience mismatch");
  }

  const canonical = stableStringify({
    v: 1 as const,
    did: payload.did,
    aud: payload.aud,
    iat: payload.iat,
    exp: payload.exp,
  });
  if (body !== canonical) {
    throw new Error("transport token: non-canonical payload");
  }

  const ok = await verifyBytes(didToPublicKey(payload.did), bodyBytes, sigBytes);
  if (!ok) {
    throw new Error("transport token: bad signature");
  }
  return { did: payload.did };
}

export function authorizationHeaderFromToken(token: string): string {
  return `Bearer ${token}`;
}

export function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader?.startsWith("Bearer ")) return undefined;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token || undefined;
}
