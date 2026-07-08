import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
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
  GAME_TTT_MOVE_PURPOSE,
  GAME_TTT_STATE_PURPOSE,
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
