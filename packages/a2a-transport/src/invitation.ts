import {
  signDataObject,
  verifyDataObject,
  type AgentKeyPair,
  type DataObject,
} from "@qwixl/protocol";
import { CONTACT_INVITE_PURPOSE } from "./constants.js";

/** Default invitation lifetime: 7 days. */
export const DEFAULT_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export const CONTACT_INVITE_SCHEMA = "https://atom.qwixl.dev/schema/ContactInvite";

export interface ContactInvitePayload {
  /** A2A JSON-RPC endpoint of the inviting agent. */
  endpoint: string;
  /** Optional human-readable inviter label. */
  name?: string;
}

/**
 * Mint a signed, purpose-scoped, TTL'd contact invitation (DIDComm OOB pattern, D026).
 * Returns a base64url token shareable over any channel (link, email, DM, QR).
 */
export async function createContactInvite(opts: {
  identity: AgentKeyPair;
  endpoint: string;
  name?: string;
  ttlSeconds?: number;
}): Promise<{ object: DataObject; token: string }> {
  const payload: ContactInvitePayload = { endpoint: opts.endpoint };
  if (opts.name) payload.name = opts.name;
  const object = await signDataObject(
    {
      semantic: { schema: CONTACT_INVITE_SCHEMA },
      payload: payload as unknown as Record<string, unknown>,
      governance: {
        purpose: CONTACT_INVITE_PURPOSE,
        ttlSeconds: opts.ttlSeconds ?? DEFAULT_INVITE_TTL_SECONDS,
      },
    },
    opts.identity,
  );
  const token = Buffer.from(JSON.stringify(object), "utf8").toString("base64url");
  return { object, token };
}

export interface VerifiedContactInvite {
  object: DataObject;
  inviterDid: string;
  endpoint: string;
  name?: string;
}

/**
 * Decode + verify an invitation token: signature, TTL expiry, and purpose
 * (`contact:invite`) are all enforced by `verifyDataObject` (D024).
 */
export async function verifyContactInvite(token: string): Promise<VerifiedContactInvite> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid invitation token encoding");
  }
  const object = await verifyDataObject(parsed, {
    allowedPurposes: [CONTACT_INVITE_PURPOSE],
  });
  if (object.semantic.schema !== CONTACT_INVITE_SCHEMA) {
    throw new Error("Invitation has unexpected schema");
  }
  const endpoint = object.payload.endpoint;
  if (typeof endpoint !== "string" || !/^https?:\/\//.test(endpoint)) {
    throw new Error("Invitation endpoint missing or invalid");
  }
  const name = typeof object.payload.name === "string" ? object.payload.name : undefined;
  return { object, inviterDid: object.issuerDid, endpoint, name };
}
