/**
 * M-ECO-12 — lean dating intro objects (no matching engine).
 */
import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import {
  DATING_INTRO_PURPOSE,
  DATING_INTRO_RESPONSE_PURPOSE,
  DATING_INTRO_RESPONSE_SCHEMA,
  DATING_INTRO_SCHEMA,
  DATING_PURPOSES,
  DEFAULT_COORDINATION_TTL_SECONDS,
} from "./constants.js";

export type DatingIntroAnswer = "accept" | "pass";

export interface DatingIntroPayload {
  displayName: string;
  oneLiner: string;
  interests?: string[];
  threadId?: string;
}

export interface DatingIntroResponsePayload {
  introId: string;
  response: DatingIntroAnswer;
  threadId?: string;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Dating payload field "${field}" must be a non-empty string`);
  }
}

async function signDatingObject(
  identity: AgentKeyPair,
  opts: {
    schema: string;
    purpose: (typeof DATING_PURPOSES)[number];
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

export async function createDatingIntro(opts: {
  identity: AgentKeyPair;
  payload: DatingIntroPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.displayName, "displayName");
  assertNonEmptyString(opts.payload.oneLiner, "oneLiner");
  const interests = Array.isArray(opts.payload.interests)
    ? opts.payload.interests.filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 8)
    : undefined;
  return signDatingObject(opts.identity, {
    schema: DATING_INTRO_SCHEMA,
    purpose: DATING_INTRO_PURPOSE,
    payload: {
      displayName: opts.payload.displayName.trim().slice(0, 80),
      oneLiner: opts.payload.oneLiner.trim().slice(0, 280),
      ...(interests?.length ? { interests } : {}),
      ...(opts.payload.threadId?.trim() ? { threadId: opts.payload.threadId.trim() } : {}),
    },
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyDatingIntro(input: unknown): Promise<{
  object: DataObject;
  payload: DatingIntroPayload;
}> {
  const object = await verifyDataObject(input, { allowedPurposes: [...DATING_PURPOSES] });
  if (object.governance.purpose !== DATING_INTRO_PURPOSE) {
    throw new Error(`Expected purpose ${DATING_INTRO_PURPOSE}`);
  }
  assertNonEmptyString(object.payload.displayName, "displayName");
  assertNonEmptyString(object.payload.oneLiner, "oneLiner");
  const interests = Array.isArray(object.payload.interests)
    ? object.payload.interests.filter((t): t is string => typeof t === "string")
    : undefined;
  return {
    object,
    payload: {
      displayName: object.payload.displayName as string,
      oneLiner: object.payload.oneLiner as string,
      interests,
      threadId: typeof object.payload.threadId === "string" ? object.payload.threadId : undefined,
    },
  };
}

export async function createDatingIntroResponse(opts: {
  identity: AgentKeyPair;
  payload: DatingIntroResponsePayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.introId, "introId");
  if (opts.payload.response !== "accept" && opts.payload.response !== "pass") {
    throw new Error('Dating intro response must be "accept" or "pass"');
  }
  return signDatingObject(opts.identity, {
    schema: DATING_INTRO_RESPONSE_SCHEMA,
    purpose: DATING_INTRO_RESPONSE_PURPOSE,
    payload: {
      introId: opts.payload.introId.trim(),
      response: opts.payload.response,
      ...(opts.payload.threadId?.trim() ? { threadId: opts.payload.threadId.trim() } : {}),
    },
    ttlSeconds: opts.ttlSeconds,
  });
}

export async function verifyDatingIntroResponse(input: unknown): Promise<{
  object: DataObject;
  payload: DatingIntroResponsePayload;
}> {
  const object = await verifyDataObject(input, { allowedPurposes: [...DATING_PURPOSES] });
  if (object.governance.purpose !== DATING_INTRO_RESPONSE_PURPOSE) {
    throw new Error(`Expected purpose ${DATING_INTRO_RESPONSE_PURPOSE}`);
  }
  assertNonEmptyString(object.payload.introId, "introId");
  const response = object.payload.response;
  if (response !== "accept" && response !== "pass") {
    throw new Error("Invalid dating intro response");
  }
  return {
    object,
    payload: {
      introId: object.payload.introId as string,
      response,
      threadId: typeof object.payload.threadId === "string" ? object.payload.threadId : undefined,
    },
  };
}
