/**
 * BUS-01-ELIG-01 — Atom-MC signed Business commerce entitlement (compact Ed25519).
 * Pattern mirrors App Store entitlementCert; different trust domain / key.
 */
import { signBytes, verifyBytes } from "@qwixl/protocol";

/** Atom-MC commerce entitlement public key (urlsafe base64, no padding). */
export const ATOM_COMMERCE_MC_PUBLIC_KEY_B64 = "wjGMrTtHxh2BkhpUpUDq16YCuvsi0E2H-xjTtlPcJvE";

export type CommerceEntitlementCertificate = {
  workspaceKind: string;
  commerceEligible: boolean;
  hosted: boolean;
  accountId?: string;
  agentId?: string;
  issuedAt: string;
  renewBy: string;
  alg: string;
  sig: string;
};

export type CommerceEntitlementClaims = Omit<CommerceEntitlementCertificate, "alg" | "sig">;

function padB64(s: string): string {
  const rem = s.length % 4;
  return rem === 0 ? s : s + "=".repeat(4 - rem);
}

export function decodeUrlsafeB64(s: string): Uint8Array {
  const normalized = padB64(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new Uint8Array(Buffer.from(normalized, "base64"));
}

export function encodeUrlsafeB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Sorted-key compact JSON body (no alg/sig) — must match MC signer. */
export function commerceEntitlementSigningBody(cert: CommerceEntitlementClaims): Uint8Array {
  const payload: Record<string, string | boolean> = {
    commerceEligible: cert.commerceEligible,
    hosted: cert.hosted,
    issuedAt: cert.issuedAt,
    renewBy: cert.renewBy,
    workspaceKind: cert.workspaceKind,
  };
  if (cert.accountId) payload.accountId = cert.accountId;
  if (cert.agentId) payload.agentId = cert.agentId;
  const ordered: Record<string, string | boolean> = {};
  for (const key of Object.keys(payload).sort()) {
    ordered[key] = payload[key]!;
  }
  return new TextEncoder().encode(JSON.stringify(ordered));
}

export function decodeCompactCommerceEntitlement(compact: string): CommerceEntitlementCertificate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(decodeUrlsafeB64(compact)));
  } catch {
    throw new Error("Commerce entitlement is not valid compact JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Commerce entitlement payload is invalid.");
  }
  const c = parsed as Record<string, unknown>;
  for (const key of ["workspaceKind", "issuedAt", "renewBy", "alg", "sig"] as const) {
    if (typeof c[key] !== "string" || !(c[key] as string).trim()) {
      throw new Error(`Commerce entitlement missing ${key}.`);
    }
  }
  if (typeof c.commerceEligible !== "boolean" || typeof c.hosted !== "boolean") {
    throw new Error("Commerce entitlement commerceEligible/hosted must be booleans.");
  }
  return {
    workspaceKind: (c.workspaceKind as string).trim(),
    commerceEligible: c.commerceEligible,
    hosted: c.hosted,
    accountId: typeof c.accountId === "string" ? c.accountId.trim() : undefined,
    agentId: typeof c.agentId === "string" ? c.agentId.trim() : undefined,
    issuedAt: (c.issuedAt as string).trim(),
    renewBy: (c.renewBy as string).trim(),
    alg: (c.alg as string).trim(),
    sig: (c.sig as string).trim(),
  };
}

export function encodeCompactCommerceEntitlement(cert: CommerceEntitlementCertificate): string {
  return encodeUrlsafeB64(new TextEncoder().encode(JSON.stringify(cert)));
}

export async function signCommerceEntitlementCert(
  claims: CommerceEntitlementClaims,
  privateKey: Uint8Array,
): Promise<string> {
  const body = commerceEntitlementSigningBody(claims);
  const sig = await signBytes(privateKey, body);
  return encodeCompactCommerceEntitlement({
    ...claims,
    alg: "Ed25519",
    sig: encodeUrlsafeB64(sig),
  });
}

/** Verify compact MC commerce entitlement. Throws on failure. */
export async function verifyCommerceEntitlementCert(
  compact: string,
  opts?: {
    now?: Date;
    publicKeyB64?: string;
  },
): Promise<CommerceEntitlementCertificate> {
  const now = opts?.now ?? new Date();
  const publicKeyB64 = opts?.publicKeyB64?.trim() || ATOM_COMMERCE_MC_PUBLIC_KEY_B64;
  const cert = decodeCompactCommerceEntitlement(compact);
  if (cert.alg !== "Ed25519") {
    throw new Error("Commerce entitlement uses an unsupported signature algorithm.");
  }
  if (cert.workspaceKind !== "business" || !cert.commerceEligible || !cert.hosted) {
    throw new Error("Commerce entitlement claims do not grant hosted Business commerce.");
  }
  const renewBy = Date.parse(cert.renewBy);
  if (!Number.isFinite(renewBy)) {
    throw new Error("Commerce entitlement renewBy is invalid.");
  }
  if (now.getTime() > renewBy) {
    throw new Error("Commerce entitlement has expired (past renewBy).");
  }
  const publicKey = decodeUrlsafeB64(publicKeyB64);
  const signature = decodeUrlsafeB64(cert.sig);
  const body = commerceEntitlementSigningBody(cert);
  const ok = await verifyBytes(publicKey, body, signature);
  if (!ok) {
    throw new Error("Commerce entitlement signature is invalid.");
  }
  return cert;
}
