import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import {
  ACTION_PURPOSES,
  ACTION_RESERVE_PURPOSE,
  ACTION_RESERVE_SCHEMA,
  DEFAULT_ACTION_RESERVE_TTL_SECONDS,
} from "./constants.js";

export type ActionPurpose = (typeof ACTION_PURPOSES)[number];

export type ActionReserveRefKind =
  | "scheduling-proposal"
  | "scheduling-slot"
  | "rsvp"
  | "generic";

export interface ActionReservePayload {
  /** Reserved resource id (slot id, rsvp id, etc.). */
  refId: string;
  refKind: ActionReserveRefKind;
  /** Link to shell attestation log entry (`attestation:<seq>:<hash-prefix>`). */
  attestationRef: string;
  /** Parent coordination object id (proposal id, rsvp request id). */
  subjectId?: string;
  label?: string;
  start?: string;
  end?: string;
  threadId?: string;
  peerDid?: string;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Action payload field "${field}" must be a non-empty string`);
  }
}

function assertRefKind(value: unknown): asserts value is ActionReserveRefKind {
  if (
    value !== "scheduling-proposal" &&
    value !== "scheduling-slot" &&
    value !== "rsvp" &&
    value !== "generic"
  ) {
    throw new Error("Action reserve refKind is invalid");
  }
}

async function signActionObject(
  identity: AgentKeyPair,
  opts: {
    schema: string;
    purpose: ActionPurpose;
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
        ttlSeconds: opts.ttlSeconds ?? DEFAULT_ACTION_RESERVE_TTL_SECONDS,
      },
    },
    identity,
  );
}

async function verifyActionObject(
  input: unknown,
  expected: { purpose: ActionPurpose; schema: string },
): Promise<DataObject> {
  const object = await verifyDataObject(input, {
    allowedPurposes: [...ACTION_PURPOSES],
  });
  if (object.governance.purpose !== expected.purpose) {
    throw new Error(`Expected purpose ${expected.purpose}, got ${object.governance.purpose}`);
  }
  if (object.semantic.schema !== expected.schema) {
    throw new Error(`Expected schema ${expected.schema}, got ${object.semantic.schema}`);
  }
  return object;
}

export async function createActionReserve(opts: {
  identity: AgentKeyPair;
  payload: ActionReservePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.refId, "refId");
  assertNonEmptyString(opts.payload.attestationRef, "attestationRef");
  assertRefKind(opts.payload.refKind);
  return signActionObject(opts.identity, {
    schema: ACTION_RESERVE_SCHEMA,
    purpose: ACTION_RESERVE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyActionReserve(input: unknown): Promise<{
  object: DataObject;
  payload: ActionReservePayload;
}> {
  const object = await verifyActionObject(input, {
    purpose: ACTION_RESERVE_PURPOSE,
    schema: ACTION_RESERVE_SCHEMA,
  });
  assertNonEmptyString(object.payload.refId, "refId");
  assertNonEmptyString(object.payload.attestationRef, "attestationRef");
  assertRefKind(object.payload.refKind);
  return {
    object,
    payload: {
      refId: object.payload.refId as string,
      refKind: object.payload.refKind as ActionReserveRefKind,
      attestationRef: object.payload.attestationRef as string,
      subjectId:
        typeof object.payload.subjectId === "string" ? object.payload.subjectId : undefined,
      label: typeof object.payload.label === "string" ? object.payload.label : undefined,
      start: typeof object.payload.start === "string" ? object.payload.start : undefined,
      end: typeof object.payload.end === "string" ? object.payload.end : undefined,
      threadId: typeof object.payload.threadId === "string" ? object.payload.threadId : undefined,
      peerDid: typeof object.payload.peerDid === "string" ? object.payload.peerDid : undefined,
    },
  };
}
