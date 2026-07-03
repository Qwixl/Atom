/** Parse `sha256:<hex>` or bare hex digest. */
export function parseIntegrity(value: string): { algorithm: "sha256"; digest: string } {
  const normalized = value.replace(/^sha256:/, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`Invalid sha256 integrity: ${value}`);
  }
  return { algorithm: "sha256", digest: normalized };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function integrityMatches(bytes: Uint8Array, expected: string): Promise<boolean> {
  const { digest } = parseIntegrity(expected);
  return sha256Hex(bytes).then((actual) => actual === digest);
}

export function formatIntegrity(digest: string): string {
  return `sha256:${digest}`;
}
