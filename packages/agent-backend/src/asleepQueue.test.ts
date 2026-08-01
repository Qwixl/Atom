import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ASLEEP_QUEUE_DEFAULT_TTL_MS,
  AsleepQueueFullError,
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
    try {
      small.enqueue({ blob: Buffer.from("c"), fromDid: "did:key:bob" });
      expect.unreachable("expected peer cap");
    } catch (error) {
      expect(error).toBeInstanceOf(AsleepQueueFullError);
      expect((error as AsleepQueueFullError).kind).toBe("peer");
    }
  });

  it("enforces total byte cap", () => {
    const small = new AsleepQueueStore({
      dirPath: path.join(dir, "byte-cap"),
      maxTotalBytes: 32,
      now: () => now,
    });
    small.enqueue({ blob: Buffer.alloc(20) });
    try {
      small.enqueue({ blob: Buffer.alloc(20) });
      expect.unreachable("expected byte cap");
    } catch (error) {
      expect(error).toBeInstanceOf(AsleepQueueFullError);
      expect((error as AsleepQueueFullError).kind).toBe("bytes");
    }
  });

  it("reloads persisted messages after a process restart", () => {
    const first = queue.enqueue({
      blob: Buffer.from("survive-restart"),
      fromDid: "did:key:alice",
    });
    const reloaded = new AsleepQueueStore({
      dirPath: path.join(dir, "asleep-inbox"),
      now: () => now,
    });
    const listed = reloaded.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(first.id);
    expect(listed[0]?.fromDid).toBe("did:key:alice");
    expect(Buffer.from(listed[0]!.blob, "base64").toString("utf8")).toBe("survive-restart");
  });

  it("enforces maxMessages cap and keeps prior entries across reload", () => {
    const capped = new AsleepQueueStore({
      dirPath: path.join(dir, "msg-cap"),
      maxMessages: 2,
      now: () => now,
    });
    const a = capped.enqueue({ blob: Buffer.from("a") });
    const b = capped.enqueue({ blob: Buffer.from("b") });
    expect(() => capped.enqueue({ blob: Buffer.from("c") })).toThrow(/500 message cap|full/);
    const reloaded = new AsleepQueueStore({
      dirPath: path.join(dir, "msg-cap"),
      maxMessages: 2,
      now: () => now,
    });
    expect(reloaded.list().map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
  });
});
