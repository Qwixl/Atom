import type { Part } from "@a2a-js/sdk";
import type { DataObject } from "@qwixl/protocol";
import { ATOM_MLS_HANDSHAKE_MEDIA_TYPE } from "./constants.js";
import { readAtomDataPart, toAtomDataPart } from "./dataPart.js";
import { bytesToBase64, base64ToBytes, type MlsWireMessage } from "@qwixl/mls-session";

export interface AtomMlsHandshakeEnvelope {
  mediaType: typeof ATOM_MLS_HANDSHAKE_MEDIA_TYPE;
  initiatorDid: string;
  /** Welcome for the joining member (required for join; omit for commit-only fan-out). */
  welcome?: string;
  ratchetTree: string;
  /** D135 — public commit for existing members (add/remove fan-out). */
  commit?: string;
  /** Optional A2A endpoint of the initiator so the responder can reply (demo peer, coordination). */
  initiatorEndpoint?: string;
  /** Room membership list after the membership change (group joins). */
  memberDids?: string[];
}

/** Structural check only; the media type is matched by the part codec. */
function hasMlsHandshakeShape(value: unknown): value is AtomMlsHandshakeEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as AtomMlsHandshakeEnvelope;
  const hasWelcome = typeof record.welcome === "string";
  const hasCommit = typeof record.commit === "string";
  return (
    typeof record.initiatorDid === "string" &&
    typeof record.ratchetTree === "string" &&
    (hasWelcome || hasCommit) &&
    (record.initiatorEndpoint === undefined || typeof record.initiatorEndpoint === "string") &&
    (record.memberDids === undefined ||
      (Array.isArray(record.memberDids) &&
        record.memberDids.every((did) => typeof did === "string"))) &&
    (record.welcome === undefined || typeof record.welcome === "string") &&
    (record.commit === undefined || typeof record.commit === "string")
  );
}

/** True for a complete Atom MLS handshake envelope, media-type key included. */
export function isAtomMlsHandshakeEnvelope(value: unknown): value is AtomMlsHandshakeEnvelope {
  if (!hasMlsHandshakeShape(value)) return false;
  return (value as AtomMlsHandshakeEnvelope).mediaType === ATOM_MLS_HANDSHAKE_MEDIA_TYPE;
}

export function mlsHandshakeToPart(envelope: AtomMlsHandshakeEnvelope): Part {
  return toAtomDataPart(ATOM_MLS_HANDSHAKE_MEDIA_TYPE, envelope);
}

export function parseMlsHandshakeFromPart(part: Part): AtomMlsHandshakeEnvelope | undefined {
  const data = readAtomDataPart(part, ATOM_MLS_HANDSHAKE_MEDIA_TYPE);
  if (!hasMlsHandshakeShape(data)) return undefined;
  return data;
}

/** Plaintext carried inside an MLS application message. */
export const ATOM_ENCRYPTED_OBJECT_MEDIA_TYPE =
  "application/vnd.atom.encrypted-data-object+json;version=1";

export interface AtomEncryptedObjectEnvelope {
  mediaType: typeof ATOM_ENCRYPTED_OBJECT_MEDIA_TYPE;
  object: DataObject;
}

export function encodeEncryptedObjectPayload(object: DataObject): Uint8Array {
  const envelope: AtomEncryptedObjectEnvelope = {
    mediaType: ATOM_ENCRYPTED_OBJECT_MEDIA_TYPE,
    object,
  };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

export function decodeEncryptedObjectPayload(plaintext: Uint8Array): DataObject {
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as AtomEncryptedObjectEnvelope;
  if (parsed?.mediaType !== ATOM_ENCRYPTED_OBJECT_MEDIA_TYPE || !parsed.object) {
    throw new Error("Invalid encrypted data-object payload");
  }
  return parsed.object;
}

export function welcomeWireToBase64(wire: MlsWireMessage): string {
  return bytesToBase64(wire);
}

export function welcomeWireFromBase64(value: string): MlsWireMessage {
  return base64ToBytes(value);
}
