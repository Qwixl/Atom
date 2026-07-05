import { sha256Hex } from "./hash.js";
import { resolveRegistryUrl } from "./resolveUrl.js";

export interface SigstoreBundleShape {
  mediaType?: string;
  dsseEnvelope?: { payload?: string; payloadType?: string };
  content?: { envelope?: { payload?: string } };
}

const SIGSTORE_BUNDLE_MEDIA = /sigstore\.bundle/;

/**
 * v1 browser runtime Sigstore check: validate bundle shape, confirm the in-toto
 * statement subject digest matches the manifest bytes, then fall back to a
 * recursive digest search for legacy bundles. Full Rekor/x509 verification
 * runs at registry ingress via `atom-registry verify --signatures` (sigstore-js).
 */
export async function verifyManifestSignature(
  manifestBytes: Uint8Array,
  signatureUrl: string | undefined,
  manifestUrl: string,
  fetchFn: typeof fetch,
  policy?: { requirePresent?: boolean },
): Promise<void> {
  if (!signatureUrl?.trim()) {
    if (policy?.requirePresent) {
      throw new Error("Manifest has no signatureUrl; install refused by owner policy");
    }
    return;
  }

  const url = resolveRegistryUrl(signatureUrl, manifestUrl);
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Signature bundle fetch failed: ${response.status} ${url}`);
  }

  let bundle: unknown;
  try {
    bundle = await response.json();
  } catch {
    throw new Error("Signature bundle is not valid JSON");
  }

  if (!isSigstoreBundleShape(bundle)) {
    throw new Error("Invalid Sigstore bundle structure (missing dsseEnvelope or content)");
  }

  const manifestDigest = await sha256Hex(manifestBytes);
  if (bundleStatementReferencesDigest(bundle, manifestDigest)) {
    return;
  }

  if (bundleReferencesDigest(bundle, manifestDigest)) {
    return;
  }

  throw new Error(
    "Sigstore bundle does not reference manifest digest (runtime digest match failed)",
  );
}

/** True when bundle has a recognizable Sigstore envelope. Exported for tests. */
export function isSigstoreBundleShape(bundle: unknown): bundle is SigstoreBundleShape {
  if (typeof bundle !== "object" || bundle === null) return false;
  const record = bundle as SigstoreBundleShape;
  if (record.mediaType && !SIGSTORE_BUNDLE_MEDIA.test(record.mediaType)) {
    return false;
  }
  return !!(record.dsseEnvelope?.payload || record.content?.envelope?.payload);
}

/** Extract manifest digest from in-toto statement inside DSSE payload. */
export function bundleStatementReferencesDigest(bundle: SigstoreBundleShape, digestHex: string): boolean {
  const envelopes = [bundle.dsseEnvelope, bundle.content?.envelope].filter(Boolean);
  for (const envelope of envelopes) {
    if (digestFromDssePayload(envelope?.payload, digestHex)) return true;
  }
  return false;
}

function digestFromDssePayload(payload: string | undefined, digestHex: string): boolean {
  if (!payload?.trim()) return false;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decoded = atob(normalized + padding);
    const statement = JSON.parse(decoded) as {
      subject?: Array<{ digest?: { sha256?: string } }>;
    };
    const subjects = statement.subject;
    if (!Array.isArray(subjects)) return false;
    return subjects.some((subject) => {
      const sha = subject.digest?.sha256;
      if (typeof sha !== "string") return false;
      return sha.replace(/^sha256:/, "").toLowerCase() === digestHex.toLowerCase();
    });
  } catch {
    return false;
  }
}

function bundleReferencesDigest(value: unknown, digestHex: string): boolean {
  if (typeof value === "string") {
    const normalized = value.replace(/^sha256:/, "").toLowerCase();
    return normalized === digestHex.toLowerCase();
  }
  if (Array.isArray(value)) {
    return value.some((item) => bundleReferencesDigest(item, digestHex));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value as Record<string, unknown>).some((item) =>
      bundleReferencesDigest(item, digestHex),
    );
  }
  return false;
}
