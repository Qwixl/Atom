import type { Message, Part } from "@a2a-js/sdk";
import {
  verifyDataObject,
  validateDataObject,
  type DataObject,
  type VerifyDataObjectOptions,
} from "@qwixl/protocol";
import { ATOM_DATA_OBJECT_MEDIA_TYPE } from "./constants.js";

export interface AtomDataObjectWireEnvelope {
  mediaType: typeof ATOM_DATA_OBJECT_MEDIA_TYPE;
  object: DataObject;
}

export function isAtomDataObjectWire(value: unknown): value is AtomDataObjectWireEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as AtomDataObjectWireEnvelope;
  return (
    record.mediaType === ATOM_DATA_OBJECT_MEDIA_TYPE &&
    typeof record.object === "object" &&
    record.object !== null
  );
}

/** Encode a signed data object as an A2A `data` part. */
export function dataObjectToPart(object: DataObject): Part {
  const wire: AtomDataObjectWireEnvelope = {
    mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE,
    object,
  };
  return {
    kind: "data",
    data: wire as unknown as Record<string, unknown>,
  };
}

export function parseWireFromPart(part: Part): AtomDataObjectWireEnvelope | undefined {
  if (part.kind !== "data") return undefined;
  const data = part.data;
  if (!isAtomDataObjectWire(data)) return undefined;
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
