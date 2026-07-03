/** Atom data-object wire types (protocol v1). See PROTOCOL-v1.md. */

export type JsonObject = Record<string, unknown>;

export interface SemanticTag {
  /** Machine-readable schema URI or vocabulary term (e.g. schema.org/Message). */
  schema: string;
  version?: string;
  /** Optional hint for embedding-based fallback when schema is unknown. */
  embeddingHint?: string;
}

export interface DataObjectGovernance {
  /** Purpose binding — receiver must allow this purpose before use (D024). */
  purpose: string;
  /** Relative TTL from issuedAt, in seconds. */
  ttlSeconds?: number;
  /** Absolute expiry (ISO 8601). Alternative to ttlSeconds. */
  expiresAt?: string;
}

export interface DataObjectPayload extends JsonObject {}

/** Signed data object (four layers: crypto envelope + semantic + payload + governance). */
export interface DataObject {
  version: 1;
  id: string;
  issuerDid: string;
  issuedAt: string;
  semantic: SemanticTag;
  payload: DataObjectPayload;
  governance: DataObjectGovernance;
  signatureAlgorithm: "ed25519";
  signature: string;
}

export interface UnsignedDataObject {
  semantic: SemanticTag;
  payload: DataObjectPayload;
  governance: DataObjectGovernance;
}

export interface AgentKeyPair {
  did: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface VerifyDataObjectOptions {
  now?: Date;
  allowedPurposes?: string[];
}

export type ValidationResult =
  | { ok: true; value: DataObject }
  | { ok: false; errors: string[] };
