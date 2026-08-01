import { verifyRoomObject, ROOM_MESSAGE_PURPOSE, ROOM_MUTATION_PURPOSE } from "@qwixl/a2a-transport";
import type { JoinedRoomMessage, RoomMessage } from "./roomStore.js";

/**
 * RI-09. What a member can say about a message the host served it.
 *
 * `legacy` and `unsigned` look identical on the wire — both are a message with
 * no signed object. The only thing that separates them is the room's migration
 * cutoff, which is why the cutoff has to be recorded locally and never taken
 * from the host. Host-acceptance attribution (RI-05 receipts) is a separate
 * verdict and is not folded into these fan-out-based classifications.
 */
export type RoomMessageVerification =
  | "verified"
  | "legacy"
  | "unsigned"
  | "invalid"
  | "substituted"
  | "omitted";

export interface ReconciledRoomMessage extends RoomMessage {
  verification: RoomMessageVerification;
  verificationDetail?: string;
}

/**
 * A message this member received directly that the host declined to serve. It
 * is kept out of `messages` deliberately: it has no host-assigned position, and
 * inventing one would corrupt the ordering the rest of the transcript relies on.
 */
export interface OmittedRoomMessage {
  objectId: string;
  roomId: string;
  senderDid: string;
  kind: "message" | "activity";
  text?: string;
  activityKind?: string;
  at: string;
  n: number;
}

export interface RoomReconciliation {
  messages: ReconciledRoomMessage[];
  omissions: OmittedRoomMessage[];
  summary: {
    verified: number;
    legacy: number;
    unsigned: number;
    invalid: number;
    substituted: number;
    omitted: number;
  };
}

function atOrAboveCutoff(
  message: RoomMessage,
  cutoff: { seq?: number; at?: string } | undefined,
): boolean {
  if (!cutoff) return false;
  if (cutoff.seq !== undefined && message.seq >= cutoff.seq) return true;
  if (cutoff.at !== undefined && message.at >= cutoff.at) return true;
  return false;
}

/**
 * Re-derive the rendered fields from the signed payload rather than trusting the
 * host's copy. A host that relays a genuine object but swaps the plaintext it
 * serves alongside it is the cheapest attack available to it, and comparing the
 * two is the only thing that catches it.
 */
function projectedFields(payload: Record<string, unknown>, purpose: string) {
  if (purpose === ROOM_MESSAGE_PURPOSE) {
    return { text: payload.text as string | undefined, activityKind: undefined };
  }
  if (purpose === ROOM_MUTATION_PURPOSE) {
    return {
      text: payload.text as string | undefined,
      activityKind: payload.action === "delete" ? "message_delete" : "message_edit",
    };
  }
  return { text: undefined, activityKind: payload.activityKind as string | undefined };
}

async function classify(
  roomId: string,
  message: RoomMessage,
  cutoff: { seq?: number; at?: string } | undefined,
): Promise<ReconciledRoomMessage> {
  const object = message.object;
  if (!object) {
    return atOrAboveCutoff(message, cutoff)
      ? {
          ...message,
          verification: "unsigned",
          verificationDetail: "No signed object at or above this room's signing cutoff",
        }
      : { ...message, verification: "legacy" };
  }
  try {
    // Verify as-of issuance: a TTL governs live acceptance, not whether an
    // archived message was authentically authored.
    const verified = await verifyRoomObject(object, { now: new Date(object.issuedAt) });
    if (verified.payload.roomId !== roomId) {
      return {
        ...message,
        verification: "invalid",
        verificationDetail: `Object is bound to room ${verified.payload.roomId}`,
      };
    }
    if (object.issuerDid !== message.senderDid) {
      return {
        ...message,
        verification: "invalid",
        verificationDetail: `Object was issued by ${object.issuerDid}, attributed to ${message.senderDid}`,
      };
    }
    const projected = projectedFields(
      verified.payload as unknown as Record<string, unknown>,
      verified.purpose,
    );
    const mismatch =
      (projected.text ?? undefined) !== (message.text ?? undefined) ||
      (projected.activityKind ?? undefined) !== (message.activityKind ?? undefined);
    if (mismatch) {
      return {
        ...message,
        // Replace the served fields with the signed ones so the reader sees what
        // was actually authored, not what the host chose to show.
        text: projected.text,
        activityKind: projected.activityKind,
        verification: "substituted",
        verificationDetail: "Host-served content did not match the signed payload",
      };
    }
    return { ...message, verification: "verified" };
  } catch (error) {
    return {
      ...message,
      verification: "invalid",
      verificationDetail: error instanceof Error ? error.message : String(error),
    };
  }
}

function omittedEntry(local: JoinedRoomMessage): OmittedRoomMessage {
  return {
    objectId: local.objectId,
    roomId: local.roomId,
    senderDid: local.senderDid,
    kind: local.kind,
    text: local.text,
    activityKind: local.activityKind,
    at: local.at,
    n: local.n,
  };
}

/**
 * Compare what the host served against what this member received directly.
 *
 * Omission is only detectable over a full range: on an incremental `after=` poll
 * a message missing from the response may simply be below the watermark, so
 * claiming omission there would fire constantly on healthy rooms.
 */
export async function reconcileHostTranscript(opts: {
  roomId: string;
  hostMessages: RoomMessage[];
  local: JoinedRoomMessage[];
  cutoff?: { seq?: number; at?: string };
  fullRange: boolean;
}): Promise<RoomReconciliation> {
  const messages: ReconciledRoomMessage[] = [];
  for (const message of opts.hostMessages) {
    messages.push(await classify(opts.roomId, message, opts.cutoff));
  }

  const omissions: OmittedRoomMessage[] = [];
  if (opts.fullRange) {
    const served = new Set<string>();
    for (const message of opts.hostMessages) {
      if (message.object?.id) served.add(message.object.id);
    }
    for (const local of opts.local) {
      if (local.continuity === "pending" || local.continuity === "fork") continue;
      if (served.has(local.objectId)) continue;
      omissions.push(omittedEntry(local));
    }
  }

  const summary = {
    verified: 0,
    legacy: 0,
    unsigned: 0,
    invalid: 0,
    substituted: 0,
    omitted: 0,
  };
  for (const message of messages) summary[message.verification] += 1;
  summary.omitted = omissions.length;
  return { messages, omissions, summary };
}
