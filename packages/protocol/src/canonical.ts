/** Deterministic JSON for Ed25519 signing (sorted object keys, stable arrays). */

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/** Fields covered by the envelope signature. */
export function signingPayload(object: {
  version: 1;
  id: string;
  issuerDid: string;
  issuedAt: string;
  semantic: unknown;
  payload: unknown;
  governance: unknown;
}): string {
  return stableStringify({
    version: object.version,
    id: object.id,
    issuerDid: object.issuerDid,
    issuedAt: object.issuedAt,
    semantic: object.semantic,
    payload: object.payload,
    governance: object.governance,
  });
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
