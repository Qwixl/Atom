import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import {
  ACTION_ANCHOR_PURPOSE,
  ACTION_ANCHOR_SCHEMA,
  CHANNEL_PURPOSES,
  DEFAULT_CHANNEL_ANCHOR_TTL_SECONDS,
} from "./constants.js";

/**
 * M11.7 bilateral state channel — append-only tamper-evident log between two parties.
 * Selective anchoring exports a signed head hash for external notarization (no chain in v1).
 */

export type ChannelEntryKind =
  | "qualify"
  | "hold"
  | "confirm"
  | "capture"
  | "release"
  | "receipt"
  | "anchor";

export interface DisputeChannelEntry {
  sequence: number;
  kind: ChannelEntryKind;
  objectId: string;
  purpose: string;
  issuerDid: string;
  at: string;
  /** sha256 hex of canonical object fingerprint. */
  objectHash: string;
}

export interface ActionAnchorPayload {
  /** Channel id — convention: `txn:<transactionId>`. */
  channelId: string;
  headSequence: number;
  headHash: string;
  entryCount: number;
  peerDid?: string;
  note?: string;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Channel payload field "${field}" must be a non-empty string`);
  }
}

function assertPositiveInt(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Channel payload field "${field}" must be a non-negative integer`);
  }
}

/** Stable fingerprint for a signed data object (not full signature replay). */
export function hashDataObjectFingerprint(object: DataObject): string {
  const canonical = JSON.stringify({
    id: object.id,
    issuerDid: object.issuerDid,
    issuedAt: object.issuedAt,
    purpose: object.governance.purpose,
    schema: object.semantic.schema,
    payload: object.payload,
  });
  return bytesToHex(sha256(utf8ToBytes(canonical)));
}

export function channelIdForTransaction(transactionId: string): string {
  return `txn:${transactionId}`;
}

export function purposeToChannelKind(purpose: string): ChannelEntryKind | undefined {
  if (purpose === "action:qualify") return "qualify";
  if (purpose === "action:hold") return "hold";
  if (purpose === "action:confirm") return "confirm";
  if (purpose === "action:capture") return "capture";
  if (purpose === "action:release") return "release";
  if (purpose === "action:receipt") return "receipt";
  if (purpose === "action:anchor") return "anchor";
  return undefined;
}

export function computeChannelHeadHash(entries: DisputeChannelEntry[]): string {
  const canonical = JSON.stringify(
    entries.map((e) => ({
      sequence: e.sequence,
      kind: e.kind,
      objectId: e.objectId,
      objectHash: e.objectHash,
    })),
  );
  return bytesToHex(sha256(utf8ToBytes(canonical)));
}

export function buildChannelEntry(object: DataObject, sequence: number): DisputeChannelEntry {
  const kind = purposeToChannelKind(object.governance.purpose);
  if (!kind) {
    throw new Error(`Unsupported purpose for channel entry: ${object.governance.purpose}`);
  }
  return {
    sequence,
    kind,
    objectId: object.id,
    purpose: object.governance.purpose,
    issuerDid: object.issuerDid,
    at: object.issuedAt,
    objectHash: hashDataObjectFingerprint(object),
  };
}

export async function createActionAnchor(opts: {
  identity: AgentKeyPair;
  payload: ActionAnchorPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.channelId, "channelId");
  assertNonEmptyString(opts.payload.headHash, "headHash");
  assertPositiveInt(opts.payload.headSequence, "headSequence");
  assertPositiveInt(opts.payload.entryCount, "entryCount");
  return signDataObject(
    {
      semantic: { schema: ACTION_ANCHOR_SCHEMA },
      payload: opts.payload as unknown as Record<string, unknown>,
      governance: {
        purpose: ACTION_ANCHOR_PURPOSE,
        ttlSeconds: opts.ttlSeconds ?? DEFAULT_CHANNEL_ANCHOR_TTL_SECONDS,
      },
    },
    opts.identity,
  );
}

export async function verifyActionAnchor(input: unknown): Promise<{
  object: DataObject;
  payload: ActionAnchorPayload;
}> {
  const object = await verifyDataObject(input, {
    allowedPurposes: [...CHANNEL_PURPOSES],
  });
  if (object.governance.purpose !== ACTION_ANCHOR_PURPOSE) {
    throw new Error(`Expected purpose ${ACTION_ANCHOR_PURPOSE}, got ${object.governance.purpose}`);
  }
  if (object.semantic.schema !== ACTION_ANCHOR_SCHEMA) {
    throw new Error(`Expected schema ${ACTION_ANCHOR_SCHEMA}, got ${object.semantic.schema}`);
  }
  assertNonEmptyString(object.payload.channelId, "channelId");
  assertNonEmptyString(object.payload.headHash, "headHash");
  assertPositiveInt(object.payload.headSequence, "headSequence");
  assertPositiveInt(object.payload.entryCount, "entryCount");
  return { object, payload: object.payload as unknown as ActionAnchorPayload };
}
