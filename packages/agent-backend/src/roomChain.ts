/**
 * RI-03 — per-sender continuity for room objects.
 *
 * Each member numbers its own room objects (`n`) and names the hash of its
 * previous one (`prevHash`), so a receiver can tell whether it holds that
 * sender's stream without gaps. This is deliberately tolerant of reordering:
 * fan-out is independent per-member HTTP with retries and the asleep queue can
 * delay delivery for hours, so arrival order is not send order. A classifier
 * that called reordering a fork would fire on honest traffic, and an alarm that
 * fires on honest traffic gets switched off.
 *
 * What a gap does NOT prove: the sender chooses its own `n` and `prevHash`, so a
 * member can withhold one of its own objects and manufacture a gap that
 * implicates the host. A gap means "this stream is discontinuous, cause
 * unknown" and nothing stronger, until host acceptance receipts (RI-05) supply
 * attribution.
 */

/** Last position accepted on a sender's chain. */
export interface RoomChainPosition {
  n: number;
  hash: string;
}

export interface IncomingChainLink {
  objectId: string;
  n: number;
  prevHash?: string;
  /** `roomObjectChainHash` of the incoming object. */
  hash: string;
  /** Arrival time, for gap ageing. Defaults to now. */
  at?: number;
}

export type RoomChainVerdict =
  /** Continuous. `unaccountedBefore` is set when we joined mid-stream. */
  | { status: "ok"; unaccountedBefore?: number }
  /** Already held, same content. Re-delivery via fan-out plus backfill is normal. */
  | { status: "duplicate" }
  /** Above the expected position; held until predecessors arrive. */
  | { status: "pending"; awaiting: number }
  /** Two objects claim one position with different content. The only conclusive artefact. */
  | { status: "fork"; at: number; heldHash: string };

export interface RoomChainTracker {
  senderDid: string;
  accepted?: RoomChainPosition;
  /** Accepted hashes by position, bounded, so a late arrival can be judged. */
  history: RoomChainPosition[];
  /** Links above the expected position, awaiting their predecessors. */
  buffered: Array<IncomingChainLink & { at: number }>;
}

/** Positions retained for fork detection on late or duplicate arrivals. */
const HISTORY_LIMIT = 200;
/** Links held out of order before we stop expecting their predecessors. */
const BUFFER_LIMIT = 100;

export function createRoomChainTracker(
  senderDid: string,
  accepted?: RoomChainPosition,
): RoomChainTracker {
  return { senderDid, accepted, history: accepted ? [accepted] : [], buffered: [] };
}

function rememberAccepted(tracker: RoomChainTracker, position: RoomChainPosition): void {
  tracker.accepted = position;
  tracker.history.push(position);
  if (tracker.history.length > HISTORY_LIMIT) {
    tracker.history = tracker.history.slice(-HISTORY_LIMIT);
  }
}

/**
 * Offer a link to a sender's chain.
 *
 * Returns the verdict for this link plus every link that became continuous as a
 * result — a buffered run is released in order once its predecessor arrives.
 */
export function admitChainLink(
  tracker: RoomChainTracker,
  incoming: IncomingChainLink,
): { verdict: RoomChainVerdict; admitted: IncomingChainLink[] } {
  const at = incoming.at ?? Date.now();

  if (!Number.isInteger(incoming.n) || incoming.n < 0) {
    throw new Error(`Invalid chain position ${incoming.n}`);
  }

  // First object we have ever held from this sender. We cannot verify what we
  // were never given, so it roots the chain wherever it lands — but a non-zero
  // position tells us that many earlier objects exist and we do not hold them,
  // which is the one thing a late joiner can still learn.
  if (!tracker.accepted) {
    rememberAccepted(tracker, { n: incoming.n, hash: incoming.hash });
    return {
      verdict: { status: "ok", unaccountedBefore: incoming.n > 0 ? incoming.n : undefined },
      admitted: [incoming],
    };
  }

  const expected = tracker.accepted.n + 1;

  if (incoming.n < expected) {
    const held = tracker.history.find((h) => h.n === incoming.n);
    if (held && held.hash === incoming.hash) return { verdict: { status: "duplicate" }, admitted: [] };
    if (held) {
      return { verdict: { status: "fork", at: incoming.n, heldHash: held.hash }, admitted: [] };
    }
    // Below the expected position but outside retained history — we cannot judge
    // it either way, so accept it as a duplicate rather than cry fork on a
    // position whose content we discarded.
    return { verdict: { status: "duplicate" }, admitted: [] };
  }

  if (incoming.n === expected) {
    // A predecessor mismatch here is the sender chaining onto a different object
    // than the one we accepted at that position: two histories, one position.
    if (incoming.prevHash !== undefined && incoming.prevHash !== tracker.accepted.hash) {
      return {
        verdict: { status: "fork", at: tracker.accepted.n, heldHash: tracker.accepted.hash },
        admitted: [],
      };
    }
    rememberAccepted(tracker, { n: incoming.n, hash: incoming.hash });
    const drained = drainBuffer(tracker);
    return { verdict: { status: "ok" }, admitted: [incoming, ...drained] };
  }

  const alreadyBuffered = tracker.buffered.find((b) => b.n === incoming.n);
  if (alreadyBuffered) {
    if (alreadyBuffered.hash === incoming.hash) {
      return { verdict: { status: "duplicate" }, admitted: [] };
    }
    return { verdict: { status: "fork", at: incoming.n, heldHash: alreadyBuffered.hash }, admitted: [] };
  }
  tracker.buffered.push({ ...incoming, at });
  tracker.buffered.sort((a, b) => a.n - b.n);
  if (tracker.buffered.length > BUFFER_LIMIT) {
    tracker.buffered = tracker.buffered.slice(-BUFFER_LIMIT);
  }
  return { verdict: { status: "pending", awaiting: expected }, admitted: [] };
}

function drainBuffer(tracker: RoomChainTracker): IncomingChainLink[] {
  const released: IncomingChainLink[] = [];
  for (;;) {
    const accepted = tracker.accepted;
    if (!accepted) break;
    const index = tracker.buffered.findIndex((b) => b.n === accepted.n + 1);
    const next = index < 0 ? undefined : tracker.buffered[index];
    if (!next) break;
    if (next.prevHash !== undefined && next.prevHash !== accepted.hash) break;
    tracker.buffered.splice(index, 1);
    rememberAccepted(tracker, { n: next.n, hash: next.hash });
    released.push(next);
  }
  return released;
}

export interface RoomChainGap {
  senderDid: string;
  /** First position we are missing. */
  from: number;
  /** Last position we are missing. */
  to: number;
  /** How long the far side of the gap has been waiting, in ms. */
  waitingMs: number;
}

/**
 * Gaps old enough to report. Deliberately a query rather than a side effect of
 * admission: a gap is provisional until backfill has had a chance to fill it,
 * and the asleep queue means "a while" can legitimately mean hours.
 */
export function chainGaps(
  tracker: RoomChainTracker,
  opts: { now?: number; minAgeMs?: number } = {},
): RoomChainGap[] {
  const now = opts.now ?? Date.now();
  const minAgeMs = opts.minAgeMs ?? 0;
  const accepted = tracker.accepted;
  if (!accepted || tracker.buffered.length === 0) return [];
  const gaps: RoomChainGap[] = [];
  let cursor = accepted.n;
  for (const held of tracker.buffered) {
    if (held.n > cursor + 1 && now - held.at >= minAgeMs) {
      gaps.push({
        senderDid: tracker.senderDid,
        from: cursor + 1,
        to: held.n - 1,
        waitingMs: now - held.at,
      });
    }
    cursor = Math.max(cursor, held.n);
  }
  return gaps;
}
