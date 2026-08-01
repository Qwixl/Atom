import {
  createRoomCheckpoint,
  roomObjectChainHash,
  verifyRoomCheckpoint,
  checkpointOverlapVerdict,
  type RoomCheckpointPayload,
} from "@qwixl/a2a-transport";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import type { RoomAcceptanceReceipt, RoomMessage, RoomStore } from "./roomStore.js";

export type CheckpointCompareVerdict = "agree" | "contradict" | "incomplete";

/**
 * Build checkpoint entries for an inclusive seq range. Every message in the
 * range MUST carry a signed object — unsigned leave/ban rows force the host to
 * mint adjacent ranges instead.
 */
export function buildCheckpointEntries(
  rooms: RoomStore,
  roomId: string,
  fromSeq: number,
  toSeq: number,
): Array<{ seq: number; objectHash: string }> {
  if (!Number.isInteger(fromSeq) || !Number.isInteger(toSeq) || fromSeq < 1 || toSeq < fromSeq) {
    throw new Error("Invalid checkpoint range");
  }
  if (toSeq - fromSeq + 1 > 500) {
    throw new Error("Checkpoint range exceeds 500 entries");
  }
  const entries: Array<{ seq: number; objectHash: string }> = [];
  for (let seq = fromSeq; seq <= toSeq; seq++) {
    const message = rooms.getMessage(roomId, seq);
    if (!message) {
      throw new Error(`Checkpoint range includes missing seq ${seq}`);
    }
    if (!message.object) {
      throw new Error(
        `Checkpoint range includes unsigned seq ${seq} — mint around leave/ban rows`,
      );
    }
    entries.push({ seq, objectHash: roomObjectChainHash(message.object) });
  }
  return entries;
}

export async function mintRoomCheckpoint(opts: {
  rooms: RoomStore;
  roomId: string;
  fromSeq: number;
  toSeq: number;
  identity: AgentKeyPair;
}): Promise<DataObject> {
  const entries = buildCheckpointEntries(opts.rooms, opts.roomId, opts.fromSeq, opts.toSeq);
  const existing = opts.rooms.findCheckpoint(opts.roomId, opts.fromSeq, opts.toSeq);
  if (existing) {
    const verified = await verifyRoomCheckpoint(existing.checkpoint, {
      expectedHostDid: opts.identity.did,
      expectedRoomId: opts.roomId,
      now: new Date(existing.checkpoint.issuedAt),
    });
    const same = verified.payload.entries.every(
      (e, i) => e.seq === entries[i]!.seq && e.objectHash === entries[i]!.objectHash,
    );
    if (same) return existing.checkpoint;
    throw new Error("Checkpoint range already minted with different hashes");
  }
  const checkpoint = await createRoomCheckpoint({
    identity: opts.identity,
    payload: {
      roomId: opts.roomId,
      fromSeq: opts.fromSeq,
      toSeq: opts.toSeq,
      entries,
    },
  });
  opts.rooms.putCheckpoint(opts.roomId, {
    fromSeq: opts.fromSeq,
    toSeq: opts.toSeq,
    checkpoint,
    mintedAt: new Date().toISOString(),
  });
  await opts.rooms.flush();
  return checkpoint;
}

/**
 * Compare a verified checkpoint against local objects / sender receipts.
 * Every seq in the checkpoint range must be accounted for (local hash or
 * receipt) for `agree`. Any uncovered seq → `incomplete`. Hash mismatch →
 * `contradict`. Receipts outside the range are ignored.
 */
export function compareCheckpointToLocal(opts: {
  payload: RoomCheckpointPayload;
  localBySeq: Map<number, { objectHash: string }>;
  receipts?: RoomAcceptanceReceipt[];
}): CheckpointCompareVerdict {
  const receiptBySeq = new Map<number, RoomAcceptanceReceipt>();
  for (const receipt of opts.receipts ?? []) {
    if (receipt.seq < opts.payload.fromSeq || receipt.seq > opts.payload.toSeq) continue;
    receiptBySeq.set(receipt.seq, receipt);
  }
  let incomplete = false;
  for (const entry of opts.payload.entries) {
    const local = opts.localBySeq.get(entry.seq);
    const receipt = receiptBySeq.get(entry.seq);
    if (local) {
      if (local.objectHash !== entry.objectHash) return "contradict";
      continue;
    }
    if (receipt) {
      if (receipt.objectHash !== entry.objectHash) return "contradict";
      continue;
    }
    incomplete = true;
  }
  return incomplete ? "incomplete" : "agree";
}

export function localHashesFromMessages(
  messages: Array<Pick<RoomMessage, "seq" | "object">>,
): Map<number, { objectHash: string }> {
  const map = new Map<number, { objectHash: string }>();
  for (const message of messages) {
    if (!message.object) continue;
    map.set(message.seq, { objectHash: roomObjectChainHash(message.object) });
  }
  return map;
}

export { checkpointOverlapVerdict };
