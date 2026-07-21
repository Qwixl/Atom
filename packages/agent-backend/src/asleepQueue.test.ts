import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ASLEEP_QUEUE_DEFAULT_TTL_MS,
  AsleepQueueStore,
} from "./asleepQueue.js";

describe("AsleepQueueStore", () => {
  let dir = "";
  let queue: AsleepQueueStore;
  let now: Date;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-asleep-"));
    now = new Date("2026-07-21T10:00:00.000Z");
    queue = new AsleepQueueStore({
      dirPath: path.join(dir, "asleep-inbox"),
      now: () => now,
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("enqueues opaque blobs with metadata", () => {
    const record = queue.enqueue({
      blob: Buffer.from("ciphertext-bytes", "utf8"),
      fromDid: "did:key:alice",
    });
    expect(record.id).toBeTruthy();
    expect(record.fromDid).toBe("did:key:alice");
    expect(record.ttlMs).toBe(ASLEEP_QUEUE_DEFAULT_TTL_MS);
    expect(record.blobEncoding).toBe("base64");
    expect(queue.list()).toHaveLength(1);
  });

  it("drains acknowledged ids", () => {
    const first = queue.enqueue({ blob: Buffer.from("one") });
    const second = queue.enqueue({ blob: Buffer.from("two") });
    const removed = queue.drain([first.id]);
    expect(removed).toHaveLength(1);
    expect(queue.list().map((m) => m.id)).toEqual([second.id]);
  });

  it("purges expired messages", () => {
    queue.enqueue({ blob: Buffer.from("fresh"), ttlMs: 60_000 });
    const stale = queue.enqueue({ blob: Buffer.from("old"), ttlMs: 1_000 });
    now = new Date(now.getTime() + 2_000);
    expect(queue.purgeExpired()).toBe(1);
    expect(queue.list().map((m) => m.id)).not.toContain(stale.id);
  });

  it("enforces per-peer pending cap", () => {
    const small = new AsleepQueueStore({
      dirPath: path.join(dir, "peer-cap"),
      maxPendingPerPeer: 2,
      now: () => now,
    });
    small.enqueue({ blob: Buffer.from("a"), fromDid: "did:key:bob" });
    small.enqueue({ blob: Buffer.from("b"), fromDid: "did:key:bob" });
    expect(() =>
      small.enqueue({ blob: Buffer.from("c"), fromDid: "did:key:bob" }),
    ).toThrow(/peer cap/);
  });

  it("enforces total byte cap", () => {
    const small = new AsleepQueueStore({
      dirPath: path.join(dir, "byte-cap"),
      maxTotalBytes: 32,
      now: () => now,
    });
    small.enqueue({ blob: Buffer.alloc(20) });
    expect(() => small.enqueue({ blob: Buffer.alloc(20) })).toThrow(/2MB total cap|full/);
  });
});
