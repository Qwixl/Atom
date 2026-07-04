import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import {
  ACTION_QUALIFY_PURPOSE,
  ACTION_QUALIFY_SCHEMA,
  DEFAULT_ACTION_QUALIFY_TTL_SECONDS,
  QUALIFY_PURPOSES,
} from "./constants.js";

/**
 * M11.6 qualify step — VC presentation (SD-JWT or JWT VC) without raw owner data.
 * Issuer trust and full VC crypto verify are out of band (see private research doc).
 */

export type QualifyVerificationMethod = "vc-sd-jwt" | "vc-jwt" | "psi-result" | "attestation-only";

/** Minimal disclosed claims the counterpart may rely on (no raw attributes). */
export interface QualifyClaimSummary {
  eligible?: boolean;
  fundsAvailable?: boolean;
  jurisdiction?: string;
  licenseClass?: string;
  overlap?: boolean;
  overlapCount?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface ActionQualifyPayload {
  /** Subject being qualified (offer id, listing id, or transaction subject). */
  subjectId: string;
  /** Optional link to an in-flight transaction. */
  transactionId?: string;
  verificationMethod: QualifyVerificationMethod;
  /** SD-JWT, JWT VC, or PSI result wire string — opaque to protocol. */
  presentation: string;
  /** Parsed or self-reported claim summary for counterpart policy checks. */
  claims: QualifyClaimSummary;
  /** Shell attestation for the owner's decision to disclose these claims. */
  attestationRef: string;
  peerDid?: string;
  /** Hint for issuer trust policy (did or URI); not verified in v1. */
  issuerHint?: string;
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Qualify payload field "${field}" must be a non-empty string`);
  }
}

function assertVerificationMethod(value: unknown): asserts value is QualifyVerificationMethod {
  if (
    value !== "vc-sd-jwt" &&
    value !== "vc-jwt" &&
    value !== "psi-result" &&
    value !== "attestation-only"
  ) {
    throw new Error("Qualify verificationMethod is invalid");
  }
}

function assertClaims(value: unknown): asserts value is QualifyClaimSummary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Qualify claims must be an object");
  }
}

export async function createActionQualify(opts: {
  identity: AgentKeyPair;
  payload: ActionQualifyPayload;
  ttlSeconds?: number;
}): Promise<DataObject> {
  assertNonEmptyString(opts.payload.subjectId, "subjectId");
  assertVerificationMethod(opts.payload.verificationMethod);
  assertNonEmptyString(opts.payload.presentation, "presentation");
  assertNonEmptyString(opts.payload.attestationRef, "attestationRef");
  assertClaims(opts.payload.claims);
  return signDataObject(
    {
      semantic: { schema: ACTION_QUALIFY_SCHEMA },
      payload: opts.payload as unknown as Record<string, unknown>,
      governance: {
        purpose: ACTION_QUALIFY_PURPOSE,
        ttlSeconds: opts.ttlSeconds ?? DEFAULT_ACTION_QUALIFY_TTL_SECONDS,
      },
    },
    opts.identity,
  );
}

export async function verifyActionQualify(input: unknown): Promise<{
  object: DataObject;
  payload: ActionQualifyPayload;
}> {
  const object = await verifyDataObject(input, {
    allowedPurposes: [...QUALIFY_PURPOSES],
  });
  if (object.governance.purpose !== ACTION_QUALIFY_PURPOSE) {
    throw new Error(`Expected purpose ${ACTION_QUALIFY_PURPOSE}, got ${object.governance.purpose}`);
  }
  if (object.semantic.schema !== ACTION_QUALIFY_SCHEMA) {
    throw new Error(`Expected schema ${ACTION_QUALIFY_SCHEMA}, got ${object.semantic.schema}`);
  }
  assertNonEmptyString(object.payload.subjectId, "subjectId");
  assertVerificationMethod(object.payload.verificationMethod);
  assertNonEmptyString(object.payload.presentation, "presentation");
  assertNonEmptyString(object.payload.attestationRef, "attestationRef");
  assertClaims(object.payload.claims);
  return { object, payload: object.payload as unknown as ActionQualifyPayload };
}

/** Best-effort JWT payload decode for dev tooling — does not verify signatures. */
export function decodeJwtPayloadUnsafe(jwt: string): Record<string, unknown> | undefined {
  const parts = jwt.split(".");
  if (parts.length < 2) return undefined;
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
