/**
 * BUS-ABUSE-01a — peek A2A JSON-RPC blobs for commerce:intent before asleep enqueue.
 */
export function a2aBlobLooksLikeCommerceIntent(blob: Buffer): boolean {
  const text = blob.toString("utf8");
  if (!text.includes("commerce:intent")) return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    return jsonContainsPurpose(parsed, "commerce:intent");
  } catch {
    // Encrypted / non-JSON opaque — still treat string hit as intent candidate (fail-closed).
    return true;
  }
}

function jsonContainsPurpose(value: unknown, purpose: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value === purpose;
  if (Array.isArray(value)) return value.some((v) => jsonContainsPurpose(v, purpose));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.purpose === purpose) return true;
    if (obj.governance && typeof obj.governance === "object") {
      const gov = obj.governance as Record<string, unknown>;
      if (gov.purpose === purpose) return true;
    }
    return Object.values(obj).some((v) => jsonContainsPurpose(v, purpose));
  }
  return false;
}
