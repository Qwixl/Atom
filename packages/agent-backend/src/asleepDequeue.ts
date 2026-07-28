import { ATOM_DATA_OBJECT_MEDIA_TYPE, type ReceivedDataObjectEvent } from "@qwixl/a2a-transport";
import type { DataObject, VerifyDataObjectOptions } from "@qwixl/protocol";
import { verifyDataObject } from "@qwixl/protocol";
import type { AsleepQueueMessage, AsleepQueueStore } from "./asleepQueue.js";

export interface AsleepDequeueOutcome {
  /** Messages removed after validation (accepted or rejected). */
  processed: number;
  /** Governed Objects that passed {{processing}} and were delivered. */
  accepted: number;
  /** Messages discarded because validation failed. */
  rejected: number;
  /** Opaque / MLS-only blobs left queued until a decrypt path exists. */
  deferred: number;
  events: ReceivedDataObjectEvent[];
}

function messageBlob(message: AsleepQueueMessage): Buffer {
  if (message.blobEncoding === "hex") {
    return Buffer.from(message.blob, "hex");
  }
  return Buffer.from(message.blob, "base64");
}

/**
 * Collect Governed Object bodies from a queued A2A JSON-RPC request body.
 * Walks wire-shaped parts (`data.object` / envelope `mediaType`) without
 * requiring the SDK tagged-union form.
 */
export function collectGovernedObjectsFromRawBody(raw: Buffer): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    return [];
  }
  const found: unknown[] = [];
  const seen = new Set<unknown>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as Record<string, unknown>;
    const mediaType = typeof record.mediaType === "string" ? record.mediaType : undefined;
    if (
      mediaType === ATOM_DATA_OBJECT_MEDIA_TYPE &&
      record.object &&
      typeof record.object === "object" &&
      !Array.isArray(record.object)
    ) {
      found.push(record.object);
    }
    for (const value of Object.values(record)) visit(value);
  };

  visit(parsed);
  return found;
}

/**
 * Apply draft {{processing}} checks when taking messages off the offline queue.
 * Queue size is already bounded at enqueue; validation happens here on dequeue
 * so unvalidated input cannot be acted upon after wake.
 */
export async function dequeueAsleepMessages(opts: {
  queue: AsleepQueueStore;
  verifyOptions?: VerifyDataObjectOptions;
  onAccept?: (event: ReceivedDataObjectEvent) => void | Promise<void>;
}): Promise<AsleepDequeueOutcome> {
  const pending = opts.queue.list(false);
  const outcome: AsleepDequeueOutcome = {
    processed: 0,
    accepted: 0,
    rejected: 0,
    deferred: 0,
    events: [],
  };

  for (const message of pending) {
    const raw = messageBlob(message);
    const candidates = collectGovernedObjectsFromRawBody(raw);
    if (candidates.length === 0) {
      outcome.deferred += 1;
      continue;
    }

    const verified: DataObject[] = [];
    let failed = false;
    for (const candidate of candidates) {
      try {
        verified.push(await verifyDataObject(candidate, opts.verifyOptions ?? {}));
      } catch {
        failed = true;
        break;
      }
    }

    // Always drain once we attempted Governed Object validation — either the
    // objects are accepted into the inbox or the blob is discarded as invalid.
    opts.queue.drain([message.id]);
    outcome.processed += 1;

    if (failed || verified.length === 0) {
      outcome.rejected += 1;
      continue;
    }

    for (const object of verified) {
      const event: ReceivedDataObjectEvent = {
        object,
        messageId: message.id,
      };
      outcome.events.push(event);
      outcome.accepted += 1;
      await opts.onAccept?.(event);
    }
  }

  return outcome;
}
