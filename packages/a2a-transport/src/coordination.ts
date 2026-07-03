import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import {
  COORDINATION_PROPOSAL_PURPOSE,
  COORDINATION_RECEIPT_PURPOSE,
  COORDINATION_RESPONSE_PURPOSE,
  COORDINATION_RSVP_PURPOSE,
  COORDINATION_RSVP_RESPONSE_PURPOSE,
  COORDINATION_PURPOSES,
  COORDINATION_RECEIPT_SCHEMA,
  DEFAULT_COORDINATION_TTL_SECONDS,
  RSVP_REQUEST_SCHEMA,
  RSVP_RESPONSE_SCHEMA,
  SCHEDULING_PROPOSAL_SCHEMA,
  SCHEDULING_RESPONSE_SCHEMA,
} from "./constants.js";

export type CoordinationPurpose = (typeof COORDINATION_PURPOSES)[number];

export interface SchedulingSlot {
  id: string;
  label: string;
  /** ISO 8601 start time. */
  start: string;
  /** ISO 8601 end time. */
  end: string;
}

export interface SchedulingProposalPayload {
  title: string;
  slots: SchedulingSlot[];
  threadId?: string;
}

export type SchedulingResponseKind = "accept" | "decline" | "counter";

export interface SchedulingResponsePayload {
  proposalId: string;
  response: SchedulingResponseKind;
  slotId?: string;
  threadId?: string;
}

export type RsvpAnswer = "yes" | "maybe" | "no";

export interface RsvpRequestPayload {
  eventTitle: string;
  /** ISO 8601 event start. */
  eventAt: string;
  location?: string;
  threadId?: string;
}

export interface RsvpResponsePayload {
  rsvpId: string;
  response: RsvpAnswer;
  threadId?: string;
}

export interface CoordinationReceiptPayload {
  refId: string;
  action: string;
  attestationRef?: string;
  threadId?: string;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Coordination payload field "${field}" must be a non-empty string`);
  }
}

function validateSchedulingSlots(slots: unknown): asserts slots is SchedulingSlot[] {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error("Scheduling proposal requires at least one slot");
  }
  for (const slot of slots) {
    if (!slot || typeof slot !== "object") throw new Error("Invalid scheduling slot");
    assertNonEmptyString((slot as SchedulingSlot).id, "slot.id");
    assertNonEmptyString((slot as SchedulingSlot).label, "slot.label");
    assertNonEmptyString((slot as SchedulingSlot).start, "slot.start");
    assertNonEmptyString((slot as SchedulingSlot).end, "slot.end");
  }
}

async function signCoordinationObject(
  identity: AgentKeyPair,
  opts: {
    schema: string;
    purpose: CoordinationPurpose;
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

async function verifyCoordinationObject(
  input: unknown,
  expected: { purpose: CoordinationPurpose; schema: string },
): Promise<DataObject> {
  const object = await verifyDataObject(input, {
    allowedPurposes: [...COORDINATION_PURPOSES],
  });
  if (object.governance.purpose !== expected.purpose) {
    throw new Error(`Expected purpose ${expected.purpose}, got ${object.governance.purpose}`);
  }
  if (object.semantic.schema !== expected.schema) {
    throw new Error(`Expected schema ${expected.schema}, got ${object.semantic.schema}`);
  }
  return object;
}

export async function createSchedulingProposal(opts: {
  identity: AgentKeyPair;
  payload: SchedulingProposalPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  validateSchedulingSlots(opts.payload.slots);
  assertNonEmptyString(opts.payload.title, "title");
  return signCoordinationObject(opts.identity, {
    schema: SCHEDULING_PROPOSAL_SCHEMA,
    purpose: COORDINATION_PROPOSAL_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifySchedulingProposal(input: unknown): Promise<{
  object: DataObject;
  payload: SchedulingProposalPayload;
}> {
  const object = await verifyCoordinationObject(input, {
    purpose: COORDINATION_PROPOSAL_PURPOSE,
    schema: SCHEDULING_PROPOSAL_SCHEMA,
  });
  const title = object.payload.title;
  const slots = object.payload.slots;
  validateSchedulingSlots(slots);
  assertNonEmptyString(title, "title");
  const threadId =
    typeof object.payload.threadId === "string" ? object.payload.threadId : undefined;
  return {
    object,
    payload: { title, slots, threadId },
  };
}

export async function createSchedulingResponse(opts: {
  identity: AgentKeyPair;
  payload: SchedulingResponsePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.proposalId, "proposalId");
  if (!["accept", "decline", "counter"].includes(opts.payload.response)) {
    throw new Error('Scheduling response must be "accept", "decline", or "counter"');
  }
  if (opts.payload.response === "accept") {
    assertNonEmptyString(opts.payload.slotId, "slotId");
  }
  return signCoordinationObject(opts.identity, {
    schema: SCHEDULING_RESPONSE_SCHEMA,
    purpose: COORDINATION_RESPONSE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifySchedulingResponse(input: unknown): Promise<{
  object: DataObject;
  payload: SchedulingResponsePayload;
}> {
  const object = await verifyCoordinationObject(input, {
    purpose: COORDINATION_RESPONSE_PURPOSE,
    schema: SCHEDULING_RESPONSE_SCHEMA,
  });
  assertNonEmptyString(object.payload.proposalId, "proposalId");
  const response = object.payload.response;
  if (response !== "accept" && response !== "decline" && response !== "counter") {
    throw new Error('Invalid scheduling response kind');
  }
  const slotId = typeof object.payload.slotId === "string" ? object.payload.slotId : undefined;
  if (response === "accept" && !slotId) {
    throw new Error("Accepted scheduling response requires slotId");
  }
  const threadId =
    typeof object.payload.threadId === "string" ? object.payload.threadId : undefined;
  return {
    object,
    payload: {
      proposalId: object.payload.proposalId as string,
      response,
      slotId,
      threadId,
    },
  };
}

export async function createRsvpRequest(opts: {
  identity: AgentKeyPair;
  payload: RsvpRequestPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.eventTitle, "eventTitle");
  assertNonEmptyString(opts.payload.eventAt, "eventAt");
  return signCoordinationObject(opts.identity, {
    schema: RSVP_REQUEST_SCHEMA,
    purpose: COORDINATION_RSVP_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyRsvpRequest(input: unknown): Promise<{
  object: DataObject;
  payload: RsvpRequestPayload;
}> {
  const object = await verifyCoordinationObject(input, {
    purpose: COORDINATION_RSVP_PURPOSE,
    schema: RSVP_REQUEST_SCHEMA,
  });
  assertNonEmptyString(object.payload.eventTitle, "eventTitle");
  assertNonEmptyString(object.payload.eventAt, "eventAt");
  const location =
    typeof object.payload.location === "string" ? object.payload.location : undefined;
  const threadId =
    typeof object.payload.threadId === "string" ? object.payload.threadId : undefined;
  return {
    object,
    payload: {
      eventTitle: object.payload.eventTitle as string,
      eventAt: object.payload.eventAt as string,
      location,
      threadId,
    },
  };
}

export async function createRsvpResponse(opts: {
  identity: AgentKeyPair;
  payload: RsvpResponsePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.rsvpId, "rsvpId");
  if (!["yes", "maybe", "no"].includes(opts.payload.response)) {
    throw new Error('RSVP response must be "yes", "maybe", or "no"');
  }
  return signCoordinationObject(opts.identity, {
    schema: RSVP_RESPONSE_SCHEMA,
    purpose: COORDINATION_RSVP_RESPONSE_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyRsvpResponse(input: unknown): Promise<{
  object: DataObject;
  payload: RsvpResponsePayload;
}> {
  const object = await verifyCoordinationObject(input, {
    purpose: COORDINATION_RSVP_RESPONSE_PURPOSE,
    schema: RSVP_RESPONSE_SCHEMA,
  });
  assertNonEmptyString(object.payload.rsvpId, "rsvpId");
  const response = object.payload.response;
  if (response !== "yes" && response !== "maybe" && response !== "no") {
    throw new Error("Invalid RSVP response");
  }
  const threadId =
    typeof object.payload.threadId === "string" ? object.payload.threadId : undefined;
  return {
    object,
    payload: {
      rsvpId: object.payload.rsvpId as string,
      response,
      threadId,
    },
  };
}

export async function createCoordinationReceipt(opts: {
  identity: AgentKeyPair;
  payload: CoordinationReceiptPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.refId, "refId");
  assertNonEmptyString(opts.payload.action, "action");
  return signCoordinationObject(opts.identity, {
    schema: COORDINATION_RECEIPT_SCHEMA,
    purpose: COORDINATION_RECEIPT_PURPOSE,
    payload: opts.payload as unknown as Record<string, unknown>,
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyCoordinationReceipt(input: unknown): Promise<{
  object: DataObject;
  payload: CoordinationReceiptPayload;
}> {
  const object = await verifyCoordinationObject(input, {
    purpose: COORDINATION_RECEIPT_PURPOSE,
    schema: COORDINATION_RECEIPT_SCHEMA,
  });
  assertNonEmptyString(object.payload.refId, "refId");
  assertNonEmptyString(object.payload.action, "action");
  const attestationRef =
    typeof object.payload.attestationRef === "string" ? object.payload.attestationRef : undefined;
  const threadId =
    typeof object.payload.threadId === "string" ? object.payload.threadId : undefined;
  return {
    object,
    payload: {
      refId: object.payload.refId as string,
      action: object.payload.action as string,
      attestationRef,
      threadId,
    },
  };
}

/** Verify any supported coordination object and return its purpose. */
export async function verifyCoordinationObjectByPurpose(input: unknown): Promise<{
  object: DataObject;
  purpose: CoordinationPurpose;
}> {
  const object = await verifyDataObject(input, {
    allowedPurposes: [...COORDINATION_PURPOSES],
  });
  const purpose = object.governance.purpose as CoordinationPurpose;
  switch (purpose) {
    case COORDINATION_PROPOSAL_PURPOSE:
      await verifySchedulingProposal(object);
      break;
    case COORDINATION_RESPONSE_PURPOSE:
      await verifySchedulingResponse(object);
      break;
    case COORDINATION_RSVP_PURPOSE:
      await verifyRsvpRequest(object);
      break;
    case COORDINATION_RSVP_RESPONSE_PURPOSE:
      await verifyRsvpResponse(object);
      break;
    case COORDINATION_RECEIPT_PURPOSE:
      await verifyCoordinationReceipt(object);
      break;
    default:
      throw new Error(`Unsupported coordination purpose: ${purpose}`);
  }
  return { object, purpose };
}
