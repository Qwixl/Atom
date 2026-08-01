import { describe, expect, it } from "vitest";
import { ReplayGuard } from "./replay.js";

const ISSUER = "did:key:zAlice";
const HOUR_MS = 60 * 60 * 1000;

function object(id: string, governance?: { ttlSeconds?: number; expiresAt?: string }, issuedAt?: string) {
  return {
    issuerDid: ISSUER,
    id,
    issuedAt: issuedAt ?? new Date(0).toISOString(),
    governance: governance ? { purpose: "comms:message", ...governance } : undefined,
  };
}

describe("ReplayGuard retention", () => {
  it("rejects a second presentation while the object is still usable", () => {
    const guard = new ReplayGuard();
    const obj = object("a", { ttlSeconds: 3600 });
    expect(guard.admit(obj, 0)).toBe(true);
    expect(guard.admit(obj, HOUR_MS / 2)).toBe(false);
  });

  it("retains only as long as the object stays usable, plus a clock margin", () => {
    const guard = new ReplayGuard();
    const obj = object("a", { ttlSeconds: 3600 });
    expect(guard.admit(obj, 0)).toBe(true);
    // Still inside the margin: the object is expired, but we have not forgotten it.
    expect(guard.admit(obj, HOUR_MS + 60_000)).toBe(false);
    // Well past expiry. Re-admitting here is safe because the expiry check in
    // verifyDataObject rejects the object before the guard is ever consulted.
    expect(guard.admit(obj, HOUR_MS + 10 * 60 * 1000)).toBe(true);
  });

  it("does not let a short TTL evict a longer-lived object's entry early", () => {
    const guard = new ReplayGuard();
    const shortLived = object("short", { ttlSeconds: 1 });
    const longLived = object("long", { ttlSeconds: 86_400 });
    guard.admit(shortLived, 0);
    guard.admit(longLived, 0);
    expect(guard.admit(longLived, HOUR_MS)).toBe(false);
  });

  it("falls back to the default retention when no expiry is declared", () => {
    const guard = new ReplayGuard({ defaultRetentionMs: 1000 });
    const obj = object("a");
    expect(guard.admit(obj, 0)).toBe(true);
    expect(guard.admit(obj, 500)).toBe(false);
    expect(guard.admit(obj, 1500)).toBe(true);
  });

  it("treats objects with no governance at all as default retention", () => {
    const guard = new ReplayGuard({ defaultRetentionMs: 1000 });
    expect(guard.admit({ issuerDid: ISSUER, id: "bare" }, 0)).toBe(true);
    expect(guard.admit({ issuerDid: ISSUER, id: "bare" }, 500)).toBe(false);
  });

  it("separates identical ids from different issuers", () => {
    const guard = new ReplayGuard();
    expect(guard.admit({ issuerDid: "did:key:zA", id: "same" }, 0)).toBe(true);
    expect(guard.admit({ issuerDid: "did:key:zB", id: "same" }, 0)).toBe(true);
  });

  it("sweeps expired entries rather than growing without bound", () => {
    const guard = new ReplayGuard({ defaultRetentionMs: 1000 });
    for (let i = 0; i < 600; i += 1) {
      guard.admit({ issuerDid: ISSUER, id: `obj-${i}` }, 0);
    }
    expect(guard.size).toBe(600);
    // One admit past the sweep interval, long after everything else lapsed.
    guard.admit({ issuerDid: ISSUER, id: "later" }, 5000);
    for (let i = 0; i < 512; i += 1) {
      guard.admit({ issuerDid: ISSUER, id: `fresh-${i}` }, 5000);
    }
    expect(guard.size).toBeLessThan(600);
  });

  it("caps entries, discarding the soonest to expire first", () => {
    const guard = new ReplayGuard({ maxEntries: 10, defaultRetentionMs: 1000 });
    guard.admit(object("keep", { ttlSeconds: 86_400 }), 0);
    for (let i = 0; i < 20; i += 1) {
      guard.admit({ issuerDid: ISSUER, id: `filler-${i}` }, 0);
    }
    expect(guard.size).toBeLessThanOrEqual(10);
    expect(guard.has(object("keep", { ttlSeconds: 86_400 }), 0)).toBe(true);
  });
});

describe("ReplayGuard persistence", () => {
  it("still rejects a replay after a snapshot and restore", () => {
    const guard = new ReplayGuard();
    const obj = object("a", { ttlSeconds: 3600 });
    guard.admit(obj, 0);

    const restored = new ReplayGuard();
    restored.restore(guard.snapshot(0), 0);
    expect(restored.admit(obj, 1000)).toBe(false);
  });

  it("drops entries that lapsed while the process was down", () => {
    const guard = new ReplayGuard();
    guard.admit(object("a", { ttlSeconds: 3600 }), 0);
    const snapshot = guard.snapshot(0);

    const restored = new ReplayGuard();
    restored.restore(snapshot, HOUR_MS + 10 * 60 * 1000);
    expect(restored.size).toBe(0);
  });

  it("never shortens protection the running process already committed to", () => {
    const guard = new ReplayGuard();
    guard.admit(object("a", { ttlSeconds: 86_400 }), 0);
    // A stale snapshot holding the same key with a much earlier expiry.
    guard.restore({ version: 1, entries: [{ key: ReplayGuard.key(ISSUER, "a"), expiresAt: 5 }] }, 0);
    expect(guard.has(object("a"), HOUR_MS)).toBe(true);
  });

  it("rejects a snapshot from an unknown version", () => {
    const guard = new ReplayGuard();
    expect(() =>
      guard.restore({ version: 2, entries: [] } as unknown as Parameters<typeof guard.restore>[0]),
    ).toThrow(/version/);
  });
});
