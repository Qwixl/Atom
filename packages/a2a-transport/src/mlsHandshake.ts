import type { Part } from "@a2a-js/sdk";
import type { DataObject } from "@qwixl/protocol";
import { ATOM_MLS_HANDSHAKE_MEDIA_TYPE } from "./constants.js";
import { bytesToBase64, base64ToBytes, type MlsWireMessage } from "@qwixl/mls-session";

export interface AtomMlsHandshakeEnvelope {
  mediaType: typeof ATOM_MLS_HANDSHAKE_MEDIA_TYPE;
  initiatorDid: string;
  welcome: string;
  ratchetTree: string;
}

export function isAtomMlsHandshakeEnvelope(value: unknown): value is AtomMlsHandshakeEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as AtomMlsHandshakeEnvelope;
  return (
    record.mediaType === ATOM_MLS_HANDSHAKE_MEDIA_TYPE &&
    typeof record.initiatorDid === "string" &&
    typeof record.welcome === "string" &&
    typeof record.ratchetTree === "string"
  );
}

export function mlsHandshakeToPart(envelope: AtomMlsHandshakeEnvelope): Part {
  return {
    kind: "data",
    data: envelope as unknown as Record<string, unknown>,
  };
}

export function parseMlsHandshakeFromPart(part: Part): AtomMlsHandshakeEnvelope | undefined {
  if (part.kind !== "data") return undefined;
  const data = part.data;
  if (!isAtomMlsHandshakeEnvelope(data)) return undefined;
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
