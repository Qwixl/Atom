import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import {
  COORDINATION_POLL_PURPOSE,
  COORDINATION_POLL_VOTE_PURPOSE,
  DEFAULT_COORDINATION_TTL_SECONDS,
  GAME_TTT_MOVE_PURPOSE,
  GAME_TTT_STATE_PURPOSE,
  POLL_REQUEST_SCHEMA,
  POLL_VOTE_SCHEMA,
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
