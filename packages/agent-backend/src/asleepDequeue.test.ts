import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { ATOM_DATA_OBJECT_MEDIA_TYPE } from "@qwixl/a2a-transport";
import { generateAgentKeyPair, ReplayGuard, signDataObject } from "@qwixl/protocol";
import { AsleepQueueStore } from "./asleepQueue.js";
import {
  collectGovernedObjectsFromRawBody,
  dequeueAsleepMessages,
} from "./asleepDequeue.js";

describe("asleep dequeue validation", () => {
  let dir = "";
  let queue: AsleepQueueStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-asleep-dq-"));
    queue = new AsleepQueueStore({ dirPath: path.join(dir, "asleep-inbox") });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("collects governed objects from wire-shaped JSON-RPC bodies", async () => {
    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "queued" },
        governance: { purpose: "comms:message" },
      },
      keyPair,
    );
    const raw = Buffer.from(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "message/send",
        params: {
          message: {
            messageId: "m1",
            parts: [
              {
                mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE,
                data: { mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE, object },
              },
            ],
          },
        },
      }),
    );
    expect(collectGovernedObjectsFromRawBody(raw)).toHaveLength(1);
  });

  it("accepts valid objects on dequeue and drains them", async () => {
    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "wake me" },
        governance: { purpose: "comms:message", ttlSeconds: 3600 },
      },
      keyPair,
    );
    queue.enqueue({
      blob: Buffer.from(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "message/send",
          params: {
            message: {
              parts: [{ data: { mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE, object } }],
            },
          },
        }),
      ),
    });

    const accepted: string[] = [];
    const outcome = await dequeueAsleepMessages({
      queue,
      verifyOptions: {
        allowedPurposes: ["comms:message"],
        replay: new ReplayGuard(),
      },
      onAccept: (event) => {
        accepted.push(String(event.object.payload.text));
      },
    });

    expect(outcome.accepted).toBe(1);
    expect(outcome.rejected).toBe(0);
    expect(outcome.deferred).toBe(0);
    expect(accepted).toEqual(["wake me"]);
    expect(queue.list()).toHaveLength(0);
  });

  it("rejects tampered objects on dequeue and drains them", async () => {
    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "original" },
        governance: { purpose: "comms:message" },
      },
      keyPair,
    );
    const tampered = { ...object, payload: { text: "evil" } };
    queue.enqueue({
      blob: Buffer.from(
        JSON.stringify({
          params: {
            message: {
              parts: [{ data: { mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE, object: tampered } }],
            },
          },
        }),
      ),
    });

    const outcome = await dequeueAsleepMessages({
      queue,
      verifyOptions: { allowedPurposes: ["comms:message"] },
    });
    expect(outcome.rejected).toBe(1);
    expect(outcome.accepted).toBe(0);
    expect(queue.list()).toHaveLength(0);
  });

  it("defers opaque MLS blobs without draining", () => {
    queue.enqueue({ blob: Buffer.from("not-json-at-all") });
    return dequeueAsleepMessages({ queue }).then((outcome) => {
      expect(outcome.deferred).toBe(1);
      expect(outcome.processed).toBe(0);
      expect(queue.list()).toHaveLength(1);
    });
  });

  it("rejects objects whose governance TTL expired while queued", async () => {
    const keyPair = await generateAgentKeyPair();
    const issuedAt = new Date("2026-07-21T10:00:00.000Z");
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "stale-at-wake" },
        governance: { purpose: "comms:message", ttlSeconds: 60 },
      },
      keyPair,
      { issuedAt: issuedAt.toISOString() },
    );
    queue.enqueue({
      blob: Buffer.from(
        JSON.stringify({
          params: {
            message: {
              parts: [{ data: { mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE, object } }],
            },
          },
        }),
      ),
    });

    const wakeNow = new Date(issuedAt.getTime() + 120_000);
    const outcome = await dequeueAsleepMessages({
      queue,
      verifyOptions: {
        allowedPurposes: ["comms:message"],
        now: wakeNow,
        replay: new ReplayGuard(),
      },
    });
    expect(outcome.rejected).toBe(1);
    expect(outcome.accepted).toBe(0);
    expect(queue.list()).toHaveLength(0);
  });

  it("rejects a replayed object on a subsequent dequeue", async () => {
    const keyPair = await generateAgentKeyPair();
    const object = await signDataObject(
      {
        semantic: { schema: "https://schema.org/Message" },
        payload: { text: "once" },
        governance: { purpose: "comms:message", ttlSeconds: 3600 },
      },
      keyPair,
    );
    const body = Buffer.from(
      JSON.stringify({
        params: {
          message: {
            parts: [{ data: { mediaType: ATOM_DATA_OBJECT_MEDIA_TYPE, object } }],
          },
        },
      }),
    );
    const replay = new ReplayGuard();
    queue.enqueue({ blob: body });
    const first = await dequeueAsleepMessages({
      queue,
      verifyOptions: { allowedPurposes: ["comms:message"], replay },
    });
    expect(first.accepted).toBe(1);

    queue.enqueue({ blob: body });
    const second = await dequeueAsleepMessages({
      queue,
      verifyOptions: { allowedPurposes: ["comms:message"], replay },
    });
    expect(second.rejected).toBe(1);
    expect(second.accepted).toBe(0);
    expect(queue.list()).toHaveLength(0);
  });
});
