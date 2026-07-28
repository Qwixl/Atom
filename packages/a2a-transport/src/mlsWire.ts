import type { Part } from "@a2a-js/sdk";
import { bytesToBase64, base64ToBytes, type MlsWireMessage } from "@qwixl/mls-session";
import { ATOM_MLS_WIRE_MEDIA_TYPE } from "./constants.js";
import { readAtomDataPart, toAtomDataPart } from "./dataPart.js";

export interface AtomMlsWireEnvelope {
  mediaType: typeof ATOM_MLS_WIRE_MEDIA_TYPE;
  /** Base64-encoded MLS wire bytes (private message, welcome, or key package). */
  wire: string;
  /** Sender agent DID (required for room fan-out). */
  senderDid?: string;
}

/** Structural check only; the media type is matched by the part codec. */
function hasMlsWireShape(value: unknown): value is AtomMlsWireEnvelope {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as AtomMlsWireEnvelope).wire === "string";
}

/** True for a complete Atom MLS wire envelope, media-type key included. */
export function isAtomMlsWireEnvelope(value: unknown): value is AtomMlsWireEnvelope {
  if (!hasMlsWireShape(value)) return false;
  return (value as AtomMlsWireEnvelope).mediaType === ATOM_MLS_WIRE_MEDIA_TYPE;
}

export function mlsWireToPart(wire: MlsWireMessage, senderDid?: string): Part {
  const envelope: AtomMlsWireEnvelope = {
    mediaType: ATOM_MLS_WIRE_MEDIA_TYPE,
    wire: bytesToBase64(wire),
    ...(senderDid?.trim() ? { senderDid: senderDid.trim() } : {}),
  };
  return toAtomDataPart(ATOM_MLS_WIRE_MEDIA_TYPE, envelope);
}

export function parseMlsWireFromPart(
  part: Part,
): { wire: MlsWireMessage; senderDid?: string } | undefined {
  const data = readAtomDataPart(part, ATOM_MLS_WIRE_MEDIA_TYPE);
  if (!hasMlsWireShape(data)) return undefined;
  return {
    wire: base64ToBytes(data.wire),
    senderDid: data.senderDid?.trim() || undefined,
  };
}
