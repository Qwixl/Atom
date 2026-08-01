import type { Message, Part } from "@a2a-js/sdk";
import {
  verifyDataObject,
  validateDataObject,
  type DataObject,
  type VerifyDataObjectOptions,
} from "@qwixl/protocol";
import { ATOM_DATA_OBJECT_MEDIA_TYPE } from "./constants.js";
import { readAtomDataPart, toAtomDataPart } from "./dataPart.js";

export interface AtomDataObjectWireEnvelope {
  mediaType: typeof ATOM_DATA_OBJECT_MEDIA_TYPE;
  object: DataObject;
}

/**
 * Structural check only. The media type is matched by the part codec, which
 * accepts it on the part itself as well as in the envelope, so a v1.0 peer that
 * sets only `Part.mediaType` is still understood here.
 */
function hasDataObjectShape(value: unknown): value is AtomDataObjectWireEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as AtomDataObjectWireEnvelope;
  return typeof record.object === "object" && record.object !== null;
}

/** True for a complete Atom data-object envelope, media-type key included. */
export function isAtomDataObjectWire(value: unknown): value is AtomDataObjectWireEnvelope {
  if (!hasDataObjectShape(value)) return false;
  return (value as AtomDataObjectWireEnvelope).mediaType === ATOM_DATA_OBJECT_MEDIA_TYPE;
}

/** Encode a signed data object as an A2A `data` part. */
export function dataObjectToPart(object: DataObject): Part {
  const wire: AtomDataObjectWireEnvelope = {
    mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE,
    object,
  };
  return toAtomDataPart(ATOM_DATA_OBJECT_MEDIA_TYPE, wire);
}

export function parseWireFromPart(part: Part): AtomDataObjectWireEnvelope | undefined {
  const data = readAtomDataPart(part, ATOM_DATA_OBJECT_MEDIA_TYPE);
  if (!hasDataObjectShape(data)) return undefined;
  return data;
}

export async function verifyPartDataObject(
  part: Part,
  options?: VerifyDataObjectOptions,
): Promise<DataObject | undefined> {
  const wire = parseWireFromPart(part);
  if (!wire) return undefined;
  return verifyDataObject(wire.object, options);
}

export async function verifyMessageDataObjects(
  message: Message,
  options?: VerifyDataObjectOptions,
): Promise<DataObject[]> {
  const verified: DataObject[] = [];
  for (const part of message.parts) {
    const object = await verifyPartDataObject(part, options);
    if (object) verified.push(object);
  }
  return verified;
}

/** Parse without signature verification (for debugging only). */
export function peekPartDataObject(part: Part): DataObject | undefined {
  const wire = parseWireFromPart(part);
  if (!wire) return undefined;
  const parsed = validateDataObject(wire.object);
  return parsed.ok ? parsed.value : undefined;
}
