import { sha256Hex } from "./hash.js";

/**
 * v1 runtime Sigstore check: fetch bundle JSON and confirm it references the
 * manifest digest. Full cryptographic verification (certificate chain, Rekor)
 * is deferred — publish-time verify via registry-tools CLI remains authoritative.
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

  const url = new URL(signatureUrl, manifestUrl).href;
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

  const manifestDigest = await sha256Hex(manifestBytes);
  if (!bundleReferencesDigest(bundle, manifestDigest)) {
    throw new Error(
      "Sigstore bundle does not reference manifest digest (runtime digest match failed)",
    );
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
