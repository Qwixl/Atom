import { describe, expect, it } from "vitest";
import {
  admitChainLink,
  chainGaps,
  createRoomChainTracker,
  type IncomingChainLink,
} from "./roomChain.js";

const SENDER = "did:key:zSender";

function link(n: number, hash: string, prevHash?: string, at?: number): IncomingChainLink {
  return { objectId: `obj-${n}-${hash}`, n, hash, prevHash, at };
}

describe("room chain continuity (RI-03)", () => {
  it("accepts a continuous stream from zero", () => {
    const tracker = createRoomChainTracker(SENDER);
    expect(admitChainLink(tracker, link(0, "h0")).verdict).toEqual({ status: "ok" });
    expect(admitChainLink(tracker, link(1, "h1", "h0")).verdict).toEqual({ status: "ok" });
    expect(admitChainLink(tracker, link(2, "h2", "h1")).verdict).toEqual({ status: "ok" });
    expect(tracker.accepted).toEqual({ n: 2, hash: "h2" });
  });

  it("roots the chain on the first object it ever sees and reports what it never held", () => {
    const tracker = createRoomChainTracker(SENDER);
    // Late joiner: the sender is already at position 7.
    const { verdict } = admitChainLink(tracker, link(7, "h7", "h6"));
    expect(verdict).toEqual({ status: "ok", unaccountedBefore: 7 });
    expect(admitChainLink(tracker, link(8, "h8", "h7")).verdict).toEqual({ status: "ok" });
  });

  it("holds an out-of-order arrival and releases it when the predecessor lands", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));

    // n=2 overtakes n=1 — normal under per-member HTTP retries.
    expect(admitChainLink(tracker, link(2, "h2", "h1")).verdict).toEqual({
      status: "pending",
      awaiting: 1,
    });
    expect(tracker.accepted).toEqual({ n: 0, hash: "h0" });

    const late = admitChainLink(tracker, link(1, "h1", "h0"));
    expect(late.verdict).toEqual({ status: "ok" });
    expect(late.admitted.map((l) => l.n)).toEqual([1, 2]);
    expect(tracker.accepted).toEqual({ n: 2, hash: "h2" });
  });

  it("releases a whole buffered run in order", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    admitChainLink(tracker, link(3, "h3", "h2"));
    admitChainLink(tracker, link(2, "h2", "h1"));
    admitChainLink(tracker, link(4, "h4", "h3"));

    const filled = admitChainLink(tracker, link(1, "h1", "h0"));
    expect(filled.admitted.map((l) => l.n)).toEqual([1, 2, 3, 4]);
    expect(tracker.accepted).toEqual({ n: 4, hash: "h4" });
    expect(tracker.buffered).toHaveLength(0);
  });

  it("never calls honest reordering a fork", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    for (const n of [5, 3, 1, 4, 2]) {
      const { verdict } = admitChainLink(tracker, link(n, `h${n}`, `h${n - 1}`));
      expect(verdict.status).not.toBe("fork");
    }
    expect(tracker.accepted).toEqual({ n: 5, hash: "h5" });
  });

  it("treats re-delivery of the same object as a duplicate, not a fork", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    admitChainLink(tracker, link(1, "h1", "h0"));
    // Same object arriving again via backfill after fan-out.
    expect(admitChainLink(tracker, link(1, "h1", "h0")).verdict).toEqual({ status: "duplicate" });
    expect(admitChainLink(tracker, link(0, "h0")).verdict).toEqual({ status: "duplicate" });
  });

  it("reports a fork when two objects claim one position with different content", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    admitChainLink(tracker, link(1, "h1", "h0"));

    const forked = admitChainLink(tracker, link(1, "h1-other", "h0"));
    expect(forked.verdict).toEqual({ status: "fork", at: 1, heldHash: "h1" });
    expect(forked.admitted).toHaveLength(0);
  });

  it("reports a fork when the next link names a predecessor we did not accept", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    const forked = admitChainLink(tracker, link(1, "h1", "h0-substituted"));
    expect(forked.verdict).toEqual({ status: "fork", at: 0, heldHash: "h0" });
    expect(tracker.accepted).toEqual({ n: 0, hash: "h0" });
  });

  it("reports a fork between two buffered objects at one position", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    admitChainLink(tracker, link(3, "h3", "h2"));
    const forked = admitChainLink(tracker, link(3, "h3-other", "h2"));
    expect(forked.verdict).toEqual({ status: "fork", at: 3, heldHash: "h3" });
  });

  it("accepts a missing prevHash as a migration chain root", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    // First v2 object from a sender that was previously on the unsigned path:
    // it has a position but no predecessor we could check.
    expect(admitChainLink(tracker, link(1, "h1")).verdict).toEqual({ status: "ok" });
  });

  it("does not report a gap until the far side has aged", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    admitChainLink(tracker, link(4, "h4", "h3", 1_000));

    expect(chainGaps(tracker, { now: 2_000, minAgeMs: 60_000 })).toEqual([]);
    expect(chainGaps(tracker, { now: 100_000, minAgeMs: 60_000 })).toEqual([
      { senderDid: SENDER, from: 1, to: 3, waitingMs: 99_000 },
    ]);
  });

  it("clears a reported gap once backfill supplies the missing links", () => {
    const tracker = createRoomChainTracker(SENDER);
    admitChainLink(tracker, link(0, "h0"));
    admitChainLink(tracker, link(3, "h3", "h2", 1_000));
    expect(chainGaps(tracker, { now: 100_000 })).toHaveLength(1);

    admitChainLink(tracker, link(1, "h1", "h0"));
    admitChainLink(tracker, link(2, "h2", "h1"));
    expect(chainGaps(tracker, { now: 100_000 })).toEqual([]);
    expect(tracker.accepted).toEqual({ n: 3, hash: "h3" });
  });

  it("resumes from a persisted position after a restart", () => {
    const tracker = createRoomChainTracker(SENDER, { n: 4, hash: "h4" });
    expect(admitChainLink(tracker, link(5, "h5", "h4")).verdict).toEqual({ status: "ok" });
    expect(admitChainLink(tracker, link(5, "h5-other", "h4")).verdict).toEqual({
      status: "fork",
      at: 5,
      heldHash: "h5",
    });
  });

  it("rejects a malformed position outright", () => {
    const tracker = createRoomChainTracker(SENDER);
    expect(() => admitChainLink(tracker, link(-1, "h"))).toThrow(/Invalid chain position/);
    expect(() => admitChainLink(tracker, link(1.5, "h"))).toThrow(/Invalid chain position/);
  });
});
