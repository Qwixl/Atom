import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";
import {
  bytesToBase64,
  signDataObject,
  signingPayload,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
  type VerifyDataObjectOptions,
} from "@qwixl/protocol";
import {
  COORDINATION_POLL_PURPOSE,
  COORDINATION_POLL_VOTE_PURPOSE,
  COORDINATION_SHARED_LIST_PURPOSE,
  COORDINATION_SHARED_LIST_UPDATE_PURPOSE,
  COORDINATION_LOCATION_PIN_PURPOSE,
  DEFAULT_COORDINATION_TTL_SECONDS,
  GAME_BS_SHOT_PURPOSE,
  GAME_BS_STATE_PURPOSE,
  GAME_BS_MOVE_PURPOSE,
  GAME_TTT_MOVE_PURPOSE,
  GAME_TTT_STATE_PURPOSE,
  ROOM_ACTIVITY_PURPOSE,
  ROOM_ACTIVITY_SCHEMA,
  ROOM_INVITE_PURPOSE,
  ROOM_INVITE_SCHEMA,
  ROOM_MEMBER_UPDATE_PURPOSE,
  ROOM_MEMBER_UPDATE_SCHEMA,
  ROOM_MESSAGE_PURPOSE,
  ROOM_MESSAGE_SCHEMA,
  ROOM_MODERATION_PURPOSE,
  ROOM_MODERATION_SCHEMA,
  ROOM_MUTATION_PURPOSE,
  ROOM_MUTATION_SCHEMA,
  ROOM_PURPOSES,
  ROOM_RECEIPT_PURPOSE,
  ROOM_RECEIPT_SCHEMA,
  ROOM_CHECKPOINT_PURPOSE,
  ROOM_CHECKPOINT_SCHEMA,
  BS_MOVE_SCHEMA,
  BS_SHOT_SCHEMA,
  BS_STATE_SCHEMA,
  LOCATION_PIN_SCHEMA,
  POLL_REQUEST_SCHEMA,
  POLL_VOTE_SCHEMA,
  SHARED_LIST_SCHEMA,
  SHARED_LIST_UPDATE_SCHEMA,
  TTT_MOVE_SCHEMA,
  TTT_STATE_SCHEMA,
} from "./constants.js";

export interface PollOption {
  id: string;
  label: string;
}

export interface PollRequestPayload {
  question: string;
  options: PollOption[];
  threadId?: string;
}

export interface PollVotePayload {
  pollId: string;
  optionId: string;
  threadId?: string;
}

export type TttMark = "X" | "O" | null;
export type TttBoard = TttMark[];

export interface TttStatePayload {
  gameId: string;
  board: TttBoard;
  turn: "X" | "O";
  status: "active" | "won" | "draw";
  winner?: "X" | "O";
  threadId?: string;
}

export interface TttMovePayload {
  gameId: string;
  cell: number;
  mark: "X" | "O";
  threadId?: string;
}

export type BsPlayer = "A" | "B";
export type BsPhase = "setup" | "battle" | "won";

export interface BsShot {
  cell: number;
  shooter: BsPlayer;
  hit: boolean;
}

export interface BattleshipsStatePayload {
  gameId: string;
  phase: BsPhase;
  turn: BsPlayer;
  commitA?: string;
  commitB?: string;
  shots: BsShot[];
  winner?: BsPlayer;
  /** Engine-backed public sync (BK-10). Host sends filtered boards for both seats. */
  publicState?: Record<string, unknown>;
  threadId?: string;
}

export interface BattleshipsMovePayload {
  gameId: string;
  player: BsPlayer;
  action: "place" | "fire";
  cells?: number[];
  cell?: number;
  threadId?: string;
}

export interface BattleshipsShotPayload {
  gameId: string;
  cell: number;
  shooter: BsPlayer;
  hit: boolean;
  threadId?: string;
}

export interface SharedListItem {
  id: string;
  text: string;
  done: boolean;
}

export interface SharedListPayload {
  listId: string;
  title: string;
  items: SharedListItem[];
  threadId?: string;
}

export interface SharedListUpdatePayload {
  listId: string;
  title?: string;
  items: SharedListItem[];
  threadId?: string;
}

export interface LocationPinPayload {
  pinId: string;
  label: string;
  /** WGS84 latitude. */
  lat: number;
  /** WGS84 longitude. */
  lng: number;
  note?: string;
  threadId?: string;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Payload field "${field}" must be a non-empty string`);
  }
}

async function signGroupObject(
  identity: AgentKeyPair,
  opts: {
    schema: string;
    purpose: string;
    payload: Record<string, unknown>;
    ttlSeconds?: number;
  },
): Promise<DataObject> {
  return signDataObject(
    {
      semantic: { schema: opts.schema },
      payload: opts.payload,
      governance: {
        purpose: opts.purpose,
        ttlSeconds: opts.ttlSeconds ?? DEFAULT_COORDINATION_TTL_SECONDS,
      },
    },
    identity,
  );
}

export async function createPollRequest(opts: {
  identity: AgentKeyPair;
  payload: PollRequestPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.question, "question");
  if (!Array.isArray(opts.payload.options) || opts.payload.options.length < 2) {
    throw new Error("Poll requires at least two options");
  }
  for (const option of opts.payload.options) {
    assertNonEmptyString(option.id, "option.id");
    assertNonEmptyString(option.label, "option.label");
  }
  return signGroupObject(opts.identity, {
    schema: POLL_REQUEST_SCHEMA,
    purpose: COORDINATION_POLL_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createPollVote(opts: {
  identity: AgentKeyPair;
  payload: PollVotePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.pollId, "pollId");
  assertNonEmptyString(opts.payload.optionId, "optionId");
  return signGroupObject(opts.identity, {
    schema: POLL_VOTE_SCHEMA,
    purpose: COORDINATION_POLL_VOTE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

function assertNonNegativeInt(value: unknown, field: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(`Payload field "${field}" must be a non-negative integer`);
  }
}

function assertOptionalNonEmptyString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined) return undefined;
  assertNonEmptyString(value, field);
  return value;
}

function assertOptionalRecord(
  value: unknown,
  field: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Payload field "${field}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertOptionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`Payload field "${field}" must be an array`);
  }
  for (let i = 0; i < value.length; i++) {
    assertNonEmptyString(value[i], `${field}[${i}]`);
  }
  return value as string[];
}

function assertChainedRoomFields(raw: Record<string, unknown>): {
  n: number;
  prevHash?: string;
} {
  assertNonNegativeInt(raw.n, "n");
  const prevHash = assertOptionalNonEmptyString(raw.prevHash, "prevHash");
  return { n: raw.n as number, prevHash };
}

const ROOM_VERIFIED_PURPOSES = [
  ROOM_MESSAGE_PURPOSE,
  ROOM_ACTIVITY_PURPOSE,
  ROOM_MUTATION_PURPOSE,
  ROOM_MODERATION_PURPOSE,
  ROOM_MEMBER_UPDATE_PURPOSE,
] as const;

type RoomVerifiedPurpose = (typeof ROOM_VERIFIED_PURPOSES)[number];

const ROOM_PURPOSE_SCHEMA: Record<RoomVerifiedPurpose, string> = {
  [ROOM_MESSAGE_PURPOSE]: ROOM_MESSAGE_SCHEMA,
  [ROOM_ACTIVITY_PURPOSE]: ROOM_ACTIVITY_SCHEMA,
  [ROOM_MUTATION_PURPOSE]: ROOM_MUTATION_SCHEMA,
  [ROOM_MODERATION_PURPOSE]: ROOM_MODERATION_SCHEMA,
  [ROOM_MEMBER_UPDATE_PURPOSE]: ROOM_MEMBER_UPDATE_SCHEMA,
};

function isRoomVerifiedPurpose(purpose: string): purpose is RoomVerifiedPurpose {
  return (ROOM_VERIFIED_PURPOSES as readonly string[]).includes(purpose);
}

async function verifySignedRoomObject(
  input: unknown,
  expected: { purpose: RoomVerifiedPurpose; schema: string },
  options?: VerifyDataObjectOptions,
): Promise<DataObject> {
  const object = await verifyDataObject(input, {
    ...options,
    allowedPurposes: options?.allowedPurposes ?? [...ROOM_PURPOSES],
  });
  if (object.governance.purpose !== expected.purpose) {
    throw new Error(`Expected purpose ${expected.purpose}, got ${object.governance.purpose}`);
  }
  if (object.semantic.schema !== expected.schema) {
    throw new Error(`Expected schema ${expected.schema}, got ${object.semantic.schema}`);
  }
  return object;
}

function parseRoomMessagePayload(raw: Record<string, unknown>): RoomMessagePayload {
  assertNonEmptyString(raw.roomId, "roomId");
  assertNonEmptyString(raw.text, "text");
  const { n, prevHash } = assertChainedRoomFields(raw);
  return {
    roomId: raw.roomId as string,
    text: raw.text as string,
    n,
    prevHash,
  };
}

function parseRoomActivityPayload(raw: Record<string, unknown>): RoomActivityPayload {
  assertNonEmptyString(raw.roomId, "roomId");
  assertNonEmptyString(raw.activityKind, "activityKind");
  const payload = assertOptionalRecord(raw.payload, "payload");
  const { n, prevHash } = assertChainedRoomFields(raw);
  return {
    roomId: raw.roomId as string,
    activityKind: raw.activityKind as string,
    payload,
    n,
    prevHash,
  };
}

function parseRoomMutationPayload(raw: Record<string, unknown>): RoomMutationPayload {
  assertNonEmptyString(raw.roomId, "roomId");
  const action = raw.action;
  if (action !== "edit" && action !== "delete") {
    throw new Error("Mutation action must be edit or delete");
  }
  assertNonEmptyString(raw.targetObjectId, "targetObjectId");
  const text = assertOptionalNonEmptyString(raw.text, "text");
  const payload = assertOptionalRecord(raw.payload, "payload");
  const { n, prevHash } = assertChainedRoomFields(raw);
  return {
    roomId: raw.roomId as string,
    action,
    targetObjectId: raw.targetObjectId as string,
    text,
    payload,
    n,
    prevHash,
  };
}

const ROOM_MODERATION_ACTIONS = ["evict", "ban", "unban", "mute", "unmute"] as const;

function parseRoomModerationPayload(raw: Record<string, unknown>): RoomModerationPayload {
  assertNonEmptyString(raw.roomId, "roomId");
  const action = raw.action;
  if (!ROOM_MODERATION_ACTIONS.includes(action as typeof ROOM_MODERATION_ACTIONS[number])) {
    throw new Error("Invalid moderation action");
  }
  assertNonEmptyString(raw.subjectDid, "subjectDid");
  const reasonCode = assertOptionalNonEmptyString(raw.reasonCode, "reasonCode");
  const effectiveFrom = assertOptionalNonEmptyString(raw.effectiveFrom, "effectiveFrom");
  const effectiveUntil = assertOptionalNonEmptyString(raw.effectiveUntil, "effectiveUntil");
  return {
    roomId: raw.roomId as string,
    action: action as RoomModerationPayload["action"],
    subjectDid: raw.subjectDid as string,
    reasonCode,
    effectiveFrom,
    effectiveUntil,
  };
}

function parseRoomMemberUpdatePayload(raw: Record<string, unknown>): RoomMemberUpdatePayload {
  assertNonEmptyString(raw.roomId, "roomId");
  const joined = assertOptionalStringArray(raw.joined, "joined");
  const left = assertOptionalStringArray(raw.left, "left");
  const evicted = assertOptionalStringArray(raw.evicted, "evicted");
  return {
    roomId: raw.roomId as string,
    joined,
    left,
    evicted,
  };
}

/**
 * Per-sender continuity hash for room objects (RI-03).
 * Hashes signingPayload — the canonical signed byte string — not the full serialized object,
 * so a host cannot break chains by re-encoding the base64 signature.
 */
export function roomObjectChainHash(object: DataObject): string {
  return bytesToBase64(sha256(utf8ToBytes(signingPayload(object))));
}

export interface RoomMessagePayload {
  roomId: string;
  text: string;
  n: number;
  prevHash?: string;
}

export interface RoomActivityPayload {
  roomId: string;
  activityKind: string;
  payload?: Record<string, unknown>;
  n: number;
  prevHash?: string;
}

export interface RoomMutationPayload {
  roomId: string;
  action: "edit" | "delete";
  targetObjectId: string;
  text?: string;
  payload?: Record<string, unknown>;
  n: number;
  prevHash?: string;
}

export interface RoomModerationPayload {
  roomId: string;
  action: "evict" | "ban" | "unban" | "mute" | "unmute";
  subjectDid: string;
  reasonCode?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

export interface RoomMemberUpdatePayload {
  roomId: string;
  joined?: string[];
  left?: string[];
  evicted?: string[];
}

/** RI-05 host acceptance receipt payload (issuer DID is the host). */
export interface RoomReceiptPayload {
  roomId: string;
  objectId: string;
  objectHash: string;
  seq: number;
  acceptedAt: string;
}

/** RI-06 flat checkpoint entry. */
export interface RoomCheckpointEntry {
  seq: number;
  objectHash: string;
}

/** RI-06 host transcript checkpoint payload (issuer DID is the host). */
export interface RoomCheckpointPayload {
  roomId: string;
  fromSeq: number;
  toSeq: number;
  entries: RoomCheckpointEntry[];
}

export type VerifiedRoomObject =
  | { purpose: typeof ROOM_MESSAGE_PURPOSE; object: DataObject; payload: RoomMessagePayload }
  | { purpose: typeof ROOM_ACTIVITY_PURPOSE; object: DataObject; payload: RoomActivityPayload }
  | { purpose: typeof ROOM_MUTATION_PURPOSE; object: DataObject; payload: RoomMutationPayload }
  | {
      purpose: typeof ROOM_MODERATION_PURPOSE;
      object: DataObject;
      payload: RoomModerationPayload;
    }
  | {
      purpose: typeof ROOM_MEMBER_UPDATE_PURPOSE;
      object: DataObject;
      payload: RoomMemberUpdatePayload;
    };

export interface RoomInvitePayload {
  roomId: string;
  hostUrl: string;
  roomName: string;
  note?: string;
}

export async function createRoomInvite(opts: {
  identity: AgentKeyPair;
  payload: RoomInvitePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.roomId, "roomId");
  assertNonEmptyString(opts.payload.hostUrl, "hostUrl");
  assertNonEmptyString(opts.payload.roomName, "roomName");
  return signGroupObject(opts.identity, {
    schema: ROOM_INVITE_SCHEMA,
    purpose: ROOM_INVITE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyRoomInvite(object: DataObject): Promise<{ payload: RoomInvitePayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== ROOM_INVITE_PURPOSE) {
    throw new Error("Not a room invite object");
  }
  if (verified.semantic.schema !== ROOM_INVITE_SCHEMA) {
    throw new Error(`Expected schema ${ROOM_INVITE_SCHEMA}, got ${verified.semantic.schema}`);
  }
  return { payload: verified.payload as unknown as RoomInvitePayload };
}

export async function createRoomMessage(opts: {
  identity: AgentKeyPair;
  payload: RoomMessagePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.roomId, "roomId");
  assertNonEmptyString(opts.payload.text, "text");
  assertNonNegativeInt(opts.payload.n, "n");
  if (opts.payload.prevHash !== undefined) {
    assertNonEmptyString(opts.payload.prevHash, "prevHash");
  }
  return signGroupObject(opts.identity, {
    schema: ROOM_MESSAGE_SCHEMA,
    purpose: ROOM_MESSAGE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createRoomActivity(opts: {
  identity: AgentKeyPair;
  payload: RoomActivityPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.roomId, "roomId");
  assertNonEmptyString(opts.payload.activityKind, "activityKind");
  assertNonNegativeInt(opts.payload.n, "n");
  if (opts.payload.prevHash !== undefined) {
    assertNonEmptyString(opts.payload.prevHash, "prevHash");
  }
  return signGroupObject(opts.identity, {
    schema: ROOM_ACTIVITY_SCHEMA,
    purpose: ROOM_ACTIVITY_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createRoomMutation(opts: {
  identity: AgentKeyPair;
  payload: RoomMutationPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.roomId, "roomId");
  if (opts.payload.action !== "edit" && opts.payload.action !== "delete") {
    throw new Error("Mutation action must be edit or delete");
  }
  assertNonEmptyString(opts.payload.targetObjectId, "targetObjectId");
  assertNonNegativeInt(opts.payload.n, "n");
  if (opts.payload.prevHash !== undefined) {
    assertNonEmptyString(opts.payload.prevHash, "prevHash");
  }
  return signGroupObject(opts.identity, {
    schema: ROOM_MUTATION_SCHEMA,
    purpose: ROOM_MUTATION_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createRoomModeration(opts: {
  identity: AgentKeyPair;
  payload: RoomModerationPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.roomId, "roomId");
  if (!ROOM_MODERATION_ACTIONS.includes(opts.payload.action)) {
    throw new Error("Invalid moderation action");
  }
  assertNonEmptyString(opts.payload.subjectDid, "subjectDid");
  return signGroupObject(opts.identity, {
    schema: ROOM_MODERATION_SCHEMA,
    purpose: ROOM_MODERATION_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createRoomMemberUpdate(opts: {
  identity: AgentKeyPair;
  payload: RoomMemberUpdatePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.roomId, "roomId");
  return signGroupObject(opts.identity, {
    schema: ROOM_MEMBER_UPDATE_SCHEMA,
    purpose: ROOM_MEMBER_UPDATE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createRoomReceipt(opts: {
  identity: AgentKeyPair;
  payload: RoomReceiptPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.roomId, "roomId");
  assertNonEmptyString(opts.payload.objectId, "objectId");
  assertNonEmptyString(opts.payload.objectHash, "objectHash");
  assertNonEmptyString(opts.payload.acceptedAt, "acceptedAt");
  assertNonNegativeInt(opts.payload.seq, "seq");
  if (opts.payload.seq < 1) {
    throw new Error('Payload field "seq" must be a positive integer');
  }
  return signGroupObject(opts.identity, {
    schema: ROOM_RECEIPT_SCHEMA,
    purpose: ROOM_RECEIPT_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyRoomReceipt(
  input: unknown,
  opts: {
    expectedHostDid: string;
    expectedRoomId: string;
    /** Must equal receipt.objectHash — typically roomObjectChainHash(acceptedObject). */
    expectedObjectHash: string;
    /** Must equal receipt.objectId — the accepted object's id. */
    expectedObjectId: string;
    now?: Date;
  },
): Promise<{ object: DataObject; payload: RoomReceiptPayload }> {
  assertNonEmptyString(opts.expectedHostDid, "expectedHostDid");
  assertNonEmptyString(opts.expectedRoomId, "expectedRoomId");
  assertNonEmptyString(opts.expectedObjectHash, "expectedObjectHash");
  assertNonEmptyString(opts.expectedObjectId, "expectedObjectId");
  const object = await verifyDataObject(input, {
    allowedPurposes: [ROOM_RECEIPT_PURPOSE],
    now: opts.now,
  });
  if (object.governance.purpose !== ROOM_RECEIPT_PURPOSE) {
    throw new Error("Not a room receipt object");
  }
  if (object.semantic.schema !== ROOM_RECEIPT_SCHEMA) {
    throw new Error(`Expected schema ${ROOM_RECEIPT_SCHEMA}, got ${object.semantic.schema}`);
  }
  if (object.issuerDid !== opts.expectedHostDid) {
    throw new Error(
      `Receipt issuer ${object.issuerDid} does not match expected host ${opts.expectedHostDid}`,
    );
  }
  const payload = parseRoomReceiptPayload(object.payload as Record<string, unknown>);
  if (payload.roomId !== opts.expectedRoomId) {
    throw new Error(
      `Receipt is bound to ${payload.roomId}, not ${opts.expectedRoomId} — cross-room replay`,
    );
  }
  if (payload.objectId !== opts.expectedObjectId) {
    throw new Error("Receipt objectId does not match the accepted object");
  }
  if (payload.objectHash !== opts.expectedObjectHash) {
    throw new Error("Receipt objectHash does not match the accepted object");
  }
  return { object, payload };
}

function parseRoomReceiptPayload(raw: Record<string, unknown>): RoomReceiptPayload {
  assertNonEmptyString(raw.roomId, "roomId");
  assertNonEmptyString(raw.objectId, "objectId");
  assertNonEmptyString(raw.objectHash, "objectHash");
  assertNonEmptyString(raw.acceptedAt, "acceptedAt");
  assertNonNegativeInt(raw.seq, "seq");
  if (raw.seq < 1) {
    throw new Error('Payload field "seq" must be a positive integer');
  }
  return {
    roomId: raw.roomId,
    objectId: raw.objectId,
    objectHash: raw.objectHash,
    seq: raw.seq,
    acceptedAt: raw.acceptedAt,
  };
}

function assertCheckpointEntries(
  fromSeq: number,
  toSeq: number,
  entries: unknown,
): RoomCheckpointEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Checkpoint entries must be a non-empty array");
  }
  if (entries.length > 500) {
    throw new Error("Checkpoint entries must not exceed 500");
  }
  if (fromSeq < 1 || toSeq < 1 || toSeq < fromSeq) {
    throw new Error("Checkpoint range is invalid");
  }
  if (toSeq - fromSeq + 1 !== entries.length) {
    throw new Error("Checkpoint entries must cover every seq in [fromSeq, toSeq]");
  }
  const out: RoomCheckpointEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== "object") {
      throw new Error("Checkpoint entry must be an object");
    }
    const seq = (entry as { seq?: unknown }).seq;
    const objectHash = (entry as { objectHash?: unknown }).objectHash;
    assertNonNegativeInt(seq, "entries.seq");
    assertNonEmptyString(objectHash, "entries.objectHash");
    if (seq !== fromSeq + i) {
      throw new Error("Checkpoint entries must be strictly increasing and contiguous");
    }
    out.push({ seq, objectHash });
  }
  if (out[0]!.seq !== fromSeq || out[out.length - 1]!.seq !== toSeq) {
    throw new Error("Checkpoint fromSeq/toSeq must match first and last entry");
  }
  return out;
}

export async function createRoomCheckpoint(opts: {
  identity: AgentKeyPair;
  payload: RoomCheckpointPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.roomId, "roomId");
  assertNonNegativeInt(opts.payload.fromSeq, "fromSeq");
  assertNonNegativeInt(opts.payload.toSeq, "toSeq");
  const entries = assertCheckpointEntries(
    opts.payload.fromSeq,
    opts.payload.toSeq,
    opts.payload.entries,
  );
  return signGroupObject(opts.identity, {
    schema: ROOM_CHECKPOINT_SCHEMA,
    purpose: ROOM_CHECKPOINT_PURPOSE,
    payload: {
      roomId: opts.payload.roomId,
      fromSeq: opts.payload.fromSeq,
      toSeq: opts.payload.toSeq,
      entries,
    },
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyRoomCheckpoint(
  input: unknown,
  opts: {
    expectedHostDid: string;
    expectedRoomId: string;
    now?: Date;
  },
): Promise<{ object: DataObject; payload: RoomCheckpointPayload }> {
  assertNonEmptyString(opts.expectedHostDid, "expectedHostDid");
  assertNonEmptyString(opts.expectedRoomId, "expectedRoomId");
  const object = await verifyDataObject(input, {
    allowedPurposes: [ROOM_CHECKPOINT_PURPOSE],
    now: opts.now,
  });
  if (object.governance.purpose !== ROOM_CHECKPOINT_PURPOSE) {
    throw new Error("Not a room checkpoint object");
  }
  if (object.semantic.schema !== ROOM_CHECKPOINT_SCHEMA) {
    throw new Error(`Expected schema ${ROOM_CHECKPOINT_SCHEMA}, got ${object.semantic.schema}`);
  }
  if (object.issuerDid !== opts.expectedHostDid) {
    throw new Error(
      `Checkpoint issuer ${object.issuerDid} does not match expected host ${opts.expectedHostDid}`,
    );
  }
  const raw = object.payload as Record<string, unknown>;
  assertNonEmptyString(raw.roomId, "roomId");
  assertNonNegativeInt(raw.fromSeq, "fromSeq");
  assertNonNegativeInt(raw.toSeq, "toSeq");
  if (raw.roomId !== opts.expectedRoomId) {
    throw new Error(
      `Checkpoint is bound to ${raw.roomId}, not ${opts.expectedRoomId} — cross-room replay`,
    );
  }
  const entries = assertCheckpointEntries(raw.fromSeq, raw.toSeq, raw.entries);
  return {
    object,
    payload: {
      roomId: raw.roomId,
      fromSeq: raw.fromSeq,
      toSeq: raw.toSeq,
      entries,
    },
  };
}

/**
 * Compare two verified checkpoints for overlapping seq disagreement.
 * Non-overlapping ranges are not contradictions.
 */
export function checkpointOverlapVerdict(
  a: RoomCheckpointPayload,
  b: RoomCheckpointPayload,
): "agree" | "contradict" | "disjoint" {
  if (a.roomId !== b.roomId) {
    throw new Error("Cannot compare checkpoints for different rooms");
  }
  const aMap = new Map(a.entries.map((e) => [e.seq, e.objectHash]));
  const bMap = new Map(b.entries.map((e) => [e.seq, e.objectHash]));
  let overlap = false;
  for (const [seq, hash] of aMap) {
    const other = bMap.get(seq);
    if (other === undefined) continue;
    overlap = true;
    if (other !== hash) return "contradict";
  }
  return overlap ? "agree" : "disjoint";
}

export async function verifyRoomObject(
  input: unknown,
  options?: VerifyDataObjectOptions,
): Promise<VerifiedRoomObject> {
  const object = await verifyDataObject(input, {
    ...options,
    allowedPurposes: options?.allowedPurposes ?? [...ROOM_PURPOSES],
  });
  const purpose = object.governance.purpose;
  if (!isRoomVerifiedPurpose(purpose)) {
    throw new Error(`Unsupported room object purpose: ${purpose}`);
  }
  const schema = ROOM_PURPOSE_SCHEMA[purpose];
  if (object.semantic.schema !== schema) {
    throw new Error(`Expected schema ${schema}, got ${object.semantic.schema}`);
  }
  const raw = object.payload as Record<string, unknown>;
  switch (purpose) {
    case ROOM_MESSAGE_PURPOSE:
      return {
        purpose,
        object,
        payload: parseRoomMessagePayload(raw),
      };
    case ROOM_ACTIVITY_PURPOSE:
      return {
        purpose,
        object,
        payload: parseRoomActivityPayload(raw),
      };
    case ROOM_MUTATION_PURPOSE:
      return {
        purpose,
        object,
        payload: parseRoomMutationPayload(raw),
      };
    case ROOM_MODERATION_PURPOSE:
      return {
        purpose,
        object,
        payload: parseRoomModerationPayload(raw),
      };
    case ROOM_MEMBER_UPDATE_PURPOSE:
      return {
        purpose,
        object,
        payload: parseRoomMemberUpdatePayload(raw),
      };
    default:
      throw new Error(`Unsupported room object purpose: ${purpose}`);
  }
}

export async function verifyRoomMessage(
  input: unknown,
  options?: VerifyDataObjectOptions,
): Promise<{ object: DataObject; payload: RoomMessagePayload }> {
  const object = await verifySignedRoomObject(
    input,
    { purpose: ROOM_MESSAGE_PURPOSE, schema: ROOM_MESSAGE_SCHEMA },
    options,
  );
  return { object, payload: parseRoomMessagePayload(object.payload as Record<string, unknown>) };
}

export async function verifyRoomActivity(
  input: unknown,
  options?: VerifyDataObjectOptions,
): Promise<{ object: DataObject; payload: RoomActivityPayload }> {
  const object = await verifySignedRoomObject(
    input,
    { purpose: ROOM_ACTIVITY_PURPOSE, schema: ROOM_ACTIVITY_SCHEMA },
    options,
  );
  return { object, payload: parseRoomActivityPayload(object.payload as Record<string, unknown>) };
}

export async function verifyRoomMutation(
  input: unknown,
  options?: VerifyDataObjectOptions,
): Promise<{ object: DataObject; payload: RoomMutationPayload }> {
  const object = await verifySignedRoomObject(
    input,
    { purpose: ROOM_MUTATION_PURPOSE, schema: ROOM_MUTATION_SCHEMA },
    options,
  );
  return { object, payload: parseRoomMutationPayload(object.payload as Record<string, unknown>) };
}

export async function verifyRoomModeration(
  input: unknown,
  options?: VerifyDataObjectOptions,
): Promise<{ object: DataObject; payload: RoomModerationPayload }> {
  const object = await verifySignedRoomObject(
    input,
    { purpose: ROOM_MODERATION_PURPOSE, schema: ROOM_MODERATION_SCHEMA },
    options,
  );
  return {
    object,
    payload: parseRoomModerationPayload(object.payload as Record<string, unknown>),
  };
}

export async function verifyRoomMemberUpdate(
  input: unknown,
  options?: VerifyDataObjectOptions,
): Promise<{ object: DataObject; payload: RoomMemberUpdatePayload }> {
  const object = await verifySignedRoomObject(
    input,
    { purpose: ROOM_MEMBER_UPDATE_PURPOSE, schema: ROOM_MEMBER_UPDATE_SCHEMA },
    options,
  );
  return {
    object,
    payload: parseRoomMemberUpdatePayload(object.payload as Record<string, unknown>),
  };
}

export async function createTttState(opts: {
  identity: AgentKeyPair;
  payload: TttStatePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.gameId, "gameId");
  if (!Array.isArray(opts.payload.board) || opts.payload.board.length !== 9) {
    throw new Error("Tic-tac-toe board must have 9 cells");
  }
  return signGroupObject(opts.identity, {
    schema: TTT_STATE_SCHEMA,
    purpose: GAME_TTT_STATE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createTttMove(opts: {
  identity: AgentKeyPair;
  payload: TttMovePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.gameId, "gameId");
  if (opts.payload.cell < 0 || opts.payload.cell > 8) {
    throw new Error("Tic-tac-toe cell must be 0–8");
  }
  if (opts.payload.mark !== "X" && opts.payload.mark !== "O") {
    throw new Error("Tic-tac-toe mark must be X or O");
  }
  return signGroupObject(opts.identity, {
    schema: TTT_MOVE_SCHEMA,
    purpose: GAME_TTT_MOVE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

function parseBsShots(raw: unknown): BsShot[] {
  if (!Array.isArray(raw)) return [];
  const shots: BsShot[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const shot = entry as BsShot;
    if (typeof shot.cell !== "number") continue;
    if (shot.shooter !== "A" && shot.shooter !== "B") continue;
    if (typeof shot.hit !== "boolean") continue;
    shots.push({ cell: shot.cell, shooter: shot.shooter, hit: shot.hit });
  }
  return shots;
}

export async function createBattleshipsState(opts: {
  identity: AgentKeyPair;
  payload: BattleshipsStatePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.gameId, "gameId");
  if (opts.payload.phase !== "setup" && opts.payload.phase !== "battle" && opts.payload.phase !== "won") {
    throw new Error("Battleships phase must be setup, battle, or won");
  }
  if (opts.payload.turn !== "A" && opts.payload.turn !== "B") {
    throw new Error("Battleships turn must be A or B");
  }
  parseBsShots(opts.payload.shots);
  return signGroupObject(opts.identity, {
    schema: BS_STATE_SCHEMA,
    purpose: GAME_BS_STATE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createBattleshipsMove(opts: {
  identity: AgentKeyPair;
  payload: BattleshipsMovePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.gameId, "gameId");
  if (opts.payload.player !== "A" && opts.payload.player !== "B") {
    throw new Error("Battleships player must be A or B");
  }
  if (opts.payload.action === "place") {
    if (!Array.isArray(opts.payload.cells) || opts.payload.cells.length === 0) {
      throw new Error("place move requires cells");
    }
  } else if (opts.payload.action === "fire") {
    if (typeof opts.payload.cell !== "number") {
      throw new Error("fire move requires cell");
    }
  } else {
    throw new Error("Battleships move action must be place or fire");
  }
  return signGroupObject(opts.identity, {
    schema: BS_MOVE_SCHEMA,
    purpose: GAME_BS_MOVE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createBattleshipsShot(opts: {
  identity: AgentKeyPair;
  payload: BattleshipsShotPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.gameId, "gameId");
  if (opts.payload.cell < 0 || opts.payload.cell > 35) {
    throw new Error("Battleships cell must be 0–35");
  }
  if (opts.payload.shooter !== "A" && opts.payload.shooter !== "B") {
    throw new Error("Battleships shooter must be A or B");
  }
  return signGroupObject(opts.identity, {
    schema: BS_SHOT_SCHEMA,
    purpose: GAME_BS_SHOT_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyPollRequest(object: DataObject): Promise<{ payload: PollRequestPayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== COORDINATION_POLL_PURPOSE) {
    throw new Error("Not a poll request object");
  }
  return { payload: verified.payload as unknown as PollRequestPayload };
}

export async function verifyPollVote(object: DataObject): Promise<{ payload: PollVotePayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== COORDINATION_POLL_VOTE_PURPOSE) {
    throw new Error("Not a poll vote object");
  }
  return { payload: verified.payload as unknown as PollVotePayload };
}

export async function verifyTttState(object: DataObject): Promise<{ payload: TttStatePayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== GAME_TTT_STATE_PURPOSE) {
    throw new Error("Not a tic-tac-toe state object");
  }
  return { payload: verified.payload as unknown as TttStatePayload };
}

export async function verifyTttMove(object: DataObject): Promise<{ payload: TttMovePayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== GAME_TTT_MOVE_PURPOSE) {
    throw new Error("Not a tic-tac-toe move object");
  }
  return { payload: verified.payload as unknown as TttMovePayload };
}

export async function verifyBattleshipsState(
  object: DataObject,
): Promise<{ payload: BattleshipsStatePayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== GAME_BS_STATE_PURPOSE) {
    throw new Error("Not a battleships state object");
  }
  return { payload: verified.payload as unknown as BattleshipsStatePayload };
}

export async function verifyBattleshipsMove(
  object: DataObject,
): Promise<{ payload: BattleshipsMovePayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== GAME_BS_MOVE_PURPOSE) {
    throw new Error("Not a battleships move object");
  }
  return { payload: verified.payload as unknown as BattleshipsMovePayload };
}

export async function verifyBattleshipsShot(
  object: DataObject,
): Promise<{ payload: BattleshipsShotPayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== GAME_BS_SHOT_PURPOSE) {
    throw new Error("Not a battleships shot object");
  }
  return { payload: verified.payload as unknown as BattleshipsShotPayload };
}

function parseSharedListItems(raw: unknown): SharedListItem[] {
  if (!Array.isArray(raw)) return [];
  const items: SharedListItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as SharedListItem;
    if (typeof item.id !== "string" || typeof item.text !== "string") continue;
    items.push({ id: item.id, text: item.text, done: item.done === true });
  }
  return items;
}

function assertSharedListItems(items: SharedListItem[]): void {
  for (const item of items) {
    assertNonEmptyString(item.id, "item.id");
    assertNonEmptyString(item.text, "item.text");
  }
}

export async function createSharedList(opts: {
  identity: AgentKeyPair;
  payload: SharedListPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.listId, "listId");
  assertNonEmptyString(opts.payload.title, "title");
  assertSharedListItems(opts.payload.items);
  return signGroupObject(opts.identity, {
    schema: SHARED_LIST_SCHEMA,
    purpose: COORDINATION_SHARED_LIST_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function createSharedListUpdate(opts: {
  identity: AgentKeyPair;
  payload: SharedListUpdatePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.listId, "listId");
  assertSharedListItems(opts.payload.items);
  return signGroupObject(opts.identity, {
    schema: SHARED_LIST_UPDATE_SCHEMA,
    purpose: COORDINATION_SHARED_LIST_UPDATE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifySharedList(object: DataObject): Promise<{ payload: SharedListPayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== COORDINATION_SHARED_LIST_PURPOSE) {
    throw new Error("Not a shared list object");
  }
  const payload = verified.payload as unknown as SharedListPayload;
  return {
    payload: {
      ...payload,
      items: parseSharedListItems(payload.items),
    },
  };
}

export async function verifySharedListUpdate(
  object: DataObject,
): Promise<{ payload: SharedListUpdatePayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== COORDINATION_SHARED_LIST_UPDATE_PURPOSE) {
    throw new Error("Not a shared list update object");
  }
  const payload = verified.payload as unknown as SharedListUpdatePayload;
  return {
    payload: {
      ...payload,
      items: parseSharedListItems(payload.items),
    },
  };
}

function assertFiniteCoord(value: number, field: string, min: number, max: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Payload field "${field}" must be a finite number between ${min} and ${max}`);
  }
}

export async function createLocationPin(opts: {
  identity: AgentKeyPair;
  payload: LocationPinPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.pinId, "pinId");
  assertNonEmptyString(opts.payload.label, "label");
  assertFiniteCoord(opts.payload.lat, "lat", -90, 90);
  assertFiniteCoord(opts.payload.lng, "lng", -180, 180);
  return signGroupObject(opts.identity, {
    schema: LOCATION_PIN_SCHEMA,
    purpose: COORDINATION_LOCATION_PIN_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyLocationPin(object: DataObject): Promise<{ payload: LocationPinPayload }> {
  const verified = await verifyDataObject(object);
  if (verified.governance.purpose !== COORDINATION_LOCATION_PIN_PURPOSE) {
    throw new Error("Not a location pin object");
  }
  const payload = verified.payload as unknown as LocationPinPayload;
  assertFiniteCoord(payload.lat, "lat", -90, 90);
  assertFiniteCoord(payload.lng, "lng", -180, 180);
  return { payload };
}
