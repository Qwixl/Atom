import type { DataObject, DataObjectGovernance, SemanticTag, UnsignedDataObject, ValidationResult } from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSemanticTag(value: unknown, path: string, errors: string[]): SemanticTag | undefined {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }
  if (typeof value.schema !== "string" || !value.schema.trim()) {
    errors.push(`${path}.schema must be a non-empty string`);
    return undefined;
  }
  if (value.version !== undefined && typeof value.version !== "string") {
    errors.push(`${path}.version must be a string when present`);
  }
  if (value.embeddingHint !== undefined && typeof value.embeddingHint !== "string") {
    errors.push(`${path}.embeddingHint must be a string when present`);
  }
  return {
    schema: value.schema.trim(),
    ...(typeof value.version === "string" ? { version: value.version } : {}),
    ...(typeof value.embeddingHint === "string" ? { embeddingHint: value.embeddingHint } : {}),
  };
}

export function validateUnsignedDataObject(
  input: unknown,
): { ok: true; value: UnsignedDataObject } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["Data object body must be an object"] };
  }

  const semantic = validateSemanticTag(input.semantic, "semantic", errors);
  if (!isPlainObject(input.payload)) {
    errors.push("payload must be an object");
  }
  if (!isPlainObject(input.governance)) {
    errors.push("governance must be an object");
  } else if (typeof input.governance.purpose !== "string" || !input.governance.purpose.trim()) {
    errors.push("governance.purpose must be a non-empty string");
  }
  if (
    input.governance &&
    isPlainObject(input.governance) &&
    input.governance.ttlSeconds !== undefined &&
    (typeof input.governance.ttlSeconds !== "number" || input.governance.ttlSeconds < 0)
  ) {
    errors.push("governance.ttlSeconds must be a non-negative number when present");
  }

  if (errors.length > 0 || !semantic || !isPlainObject(input.payload) || !isPlainObject(input.governance)) {
    return { ok: false, errors };
  }

  const governance = input.governance as Record<string, unknown>;
  const gov: DataObjectGovernance = {
    purpose: String(governance.purpose).trim(),
    ...(typeof governance.ttlSeconds === "number" ? { ttlSeconds: governance.ttlSeconds } : {}),
    ...(typeof governance.expiresAt === "string" ? { expiresAt: governance.expiresAt } : {}),
  };
  const unsigned: UnsignedDataObject = {
    semantic,
    payload: input.payload as Record<string, unknown>,
    governance: gov,
  };
  return { ok: true, value: unsigned };
}

export function validateDataObject(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["Data object must be an object"] };
  }
  if (input.version !== 1) {
    errors.push("version must be literal 1");
  }
  if (typeof input.id !== "string" || !input.id.trim()) {
    errors.push("id must be a non-empty string");
  }
  if (typeof input.issuerDid !== "string" || !input.issuerDid.startsWith("did:key:")) {
    errors.push("issuerDid must be a did:key DID");
  }
  if (typeof input.issuedAt !== "string" || Number.isNaN(Date.parse(input.issuedAt))) {
    errors.push("issuedAt must be an ISO 8601 timestamp string");
  }
  if (input.signatureAlgorithm !== "ed25519") {
    errors.push('signatureAlgorithm must be "ed25519"');
  }
  if (typeof input.signature !== "string" || !input.signature.trim()) {
    errors.push("signature must be a non-empty base64 string");
  }

  const bodyResult = validateUnsignedDataObject({
    semantic: input.semantic,
    payload: input.payload,
    governance: input.governance,
  });
  if (!bodyResult.ok) {
    errors.push(...bodyResult.errors);
  }

  if (errors.length > 0 || !bodyResult.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      version: 1,
      id: String(input.id).trim(),
      issuerDid: String(input.issuerDid),
      issuedAt: String(input.issuedAt),
      semantic: bodyResult.value.semantic,
      payload: bodyResult.value.payload,
      governance: bodyResult.value.governance,
      signatureAlgorithm: "ed25519",
      signature: String(input.signature).trim(),
    },
  };
}
