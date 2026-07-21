/**
 * Offline entitlement certificate verify against pinned Atom App Store key (D072 / A008).
 * Compact format matches Atom-Apps `backend/app/entitlements.py`.
 */

import { verifyBytes } from "@qwixl/protocol";

/** Production store public key (urlsafe base64, no padding) — Atom-Apps A008 ceremony. */
export const ATOM_APPS_STORE_PUBLIC_KEY_B64 = "hlieSW_xscS6hdAGVvxV2wOdeb6hjTv1iN17-dIZy48";

export type EntitlementCertificate = {
  ownerDid: string;
  moduleId: string;
  versionRange: string;
  issuedAt: string;
  renewBy: string;
  alg: string;
  sig: string;
};

function padB64(s: string): string {
  const rem = s.length % 4;
  return rem === 0 ? s : s + "=".repeat(4 - rem);
}

export function decodeUrlsafeB64(s: string): Uint8Array {
  const normalized = padB64(s.replace(/-/g, "+").replace(/_/g, "/"));
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Rebuild the exact signing payload used by the store (sorted keys, compact JSON). */
export function certificateSigningBody(cert: EntitlementCertificate): Uint8Array {
  const payload = {
    issuedAt: cert.issuedAt,
    moduleId: cert.moduleId,
    ownerDid: cert.ownerDid,
    renewBy: cert.renewBy,
    versionRange: cert.versionRange,
  };
  return encodeUtf8(JSON.stringify(payload));
}

export function decodeCompactCertificate(compact: string): EntitlementCertificate {
  let parsed: unknown;
  try {
    const json = new TextDecoder().decode(decodeUrlsafeB64(compact));
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Entitlement certificate is not valid compact JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Entitlement certificate payload is invalid.");
  }
  const c = parsed as Record<string, unknown>;
  for (const key of [
    "ownerDid",
    "moduleId",
    "versionRange",
    "issuedAt",
    "renewBy",
    "alg",
    "sig",
  ] as const) {
    if (typeof c[key] !== "string" || !(c[key] as string).trim()) {
      throw new Error(`Entitlement certificate missing ${key}.`);
    }
  }
  return {
    ownerDid: (c.ownerDid as string).trim(),
    moduleId: (c.moduleId as string).trim(),
    versionRange: (c.versionRange as string).trim(),
    issuedAt: (c.issuedAt as string).trim(),
    renewBy: (c.renewBy as string).trim(),
    alg: (c.alg as string).trim(),
    sig: (c.sig as string).trim(),
  };
}

function versionMatchesRange(version: string, versionRange: string): boolean {
  const v = version.trim();
  const r = versionRange.trim();
  if (!v || !r) return false;
  if (r === "*" || r === "x" || r === "X") return true;
  return v === r;
}

/**
 * Verify compact cert for this module/version against the pinned store key.
 * Throws with an actionable message on failure.
 */
export async function verifyInstallEntitlementCert(
  compact: string,
  opts: {
    moduleId: string;
    version: string;
    now?: Date;
    storePublicKeyB64?: string;
  },
): Promise<EntitlementCertificate> {
  const moduleId = opts.moduleId;
  const version = opts.version;
  const now = opts.now ?? new Date();
  const storePublicKeyB64 = opts.storePublicKeyB64 ?? ATOM_APPS_STORE_PUBLIC_KEY_B64;
  const cert = decodeCompactCertificate(compact);
  if (cert.alg !== "Ed25519") {
    throw new Error("Entitlement certificate uses an unsupported signature algorithm.");
  }
  if (cert.moduleId !== moduleId) {
    throw new Error("Entitlement certificate is for a different module.");
  }
  if (!versionMatchesRange(version, cert.versionRange)) {
    throw new Error("Entitlement certificate does not cover this module version.");
  }
  const renewBy = Date.parse(cert.renewBy);
  if (!Number.isFinite(renewBy)) {
    throw new Error("Entitlement certificate renewBy is invalid.");
  }
  if (now.getTime() > renewBy) {
    throw new Error(
      "Entitlement certificate has expired (past renewBy). Open the App Store while online to renew.",
    );
  }

  const publicKey = decodeUrlsafeB64(storePublicKeyB64);
  const signature = decodeUrlsafeB64(cert.sig);
  const body = certificateSigningBody(cert);
  const ok = await verifyBytes(publicKey, body, signature);
  if (!ok) {
    throw new Error("Entitlement certificate signature is invalid.");
  }
  return cert;
}
