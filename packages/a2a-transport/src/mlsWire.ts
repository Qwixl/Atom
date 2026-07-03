import type { Part } from "@a2a-js/sdk";
import { bytesToBase64, base64ToBytes, type MlsWireMessage } from "@qwixl/mls-session";
import { ATOM_MLS_WIRE_MEDIA_TYPE } from "./constants.js";

export interface AtomMlsWireEnvelope {
  mediaType: typeof ATOM_MLS_WIRE_MEDIA_TYPE;
  /** Base64-encoded MLS wire bytes (private message, welcome, or key package). */
  wire: string;
}

export function isAtomMlsWireEnvelope(value: unknown): value is AtomMlsWireEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as AtomMlsWireEnvelope;
  return record.mediaType === ATOM_MLS_WIRE_MEDIA_TYPE && typeof record.wire === "string";
}

export function mlsWireToPart(wire: MlsWireMessage): Part {
  const envelope: AtomMlsWireEnvelope = {
    mediaType: ATOM_MLS_WIRE_MEDIA_TYPE,
    wire: bytesToBase64(wire),
  };
  return {
    kind: "data",
    data: envelope as unknown as Record<string, unknown>,
  };
}

export function parseMlsWireFromPart(part: Part): MlsWireMessage | undefined {
  if (part.kind !== "data") return undefined;
  const data = part.data;
  if (!isAtomMlsWireEnvelope(data)) return undefined;
  return base64ToBytes(data.wire);
}
