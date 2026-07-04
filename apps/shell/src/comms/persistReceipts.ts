import type { OwnerStore } from "@qwixl/owner-store";
import type { JsonValue } from "@qwixl/shell-core";
import {
  buildCommerceReceiptUpsert,
  type AttestationCrossRefEntry,
} from "@qwixl/owner-store";
import { ACTION_RECEIPT_PURPOSE } from "@qwixl/a2a-transport";
import type { InboxEntryWire } from "./types.js";

export function persistCommerceReceiptsFromInbox(opts: {
  inbox: InboxEntryWire[];
  ownerStore: OwnerStore;
  attestationEntries: readonly AttestationCrossRefEntry[];
  persistedReceiptIds: Set<string>;
}): number {
  let added = 0;
  for (const entry of opts.inbox) {
    if (entry.object.governance.purpose !== ACTION_RECEIPT_PURPOSE) continue;
    const objectId = entry.object.id;
    if (opts.persistedReceiptIds.has(objectId)) continue;

    const payload = entry.object.payload;
    const transactionId = String(payload.transactionId ?? "");
    const railRef = String(payload.railRef ?? "");
    const attestationRef = String(payload.attestationRef ?? "");
    const capturedAt = String(payload.capturedAt ?? entry.receivedAt);
    const peerDid = entry.object.issuerDid;
    if (!transactionId || !railRef || !attestationRef) continue;

    const amountRaw = payload.amount;
    if (
      typeof amountRaw !== "object" ||
      amountRaw === null ||
      typeof (amountRaw as { currency?: unknown }).currency !== "string" ||
      typeof (amountRaw as { amountMinor?: unknown }).amountMinor !== "number"
    ) {
      continue;
    }
    const amount = {
      currency: (amountRaw as { currency: string }).currency,
      amountMinor: (amountRaw as { amountMinor: number }).amountMinor,
    };

    const upsert = buildCommerceReceiptUpsert({
      transactionId,
      receiptObjectId: objectId,
      railRef,
      amount,
      attestationRef,
      attestationEntries: opts.attestationEntries,
      capturedAt,
      peerDid,
      label: typeof payload.label === "string" ? payload.label : undefined,
    });
    opts.ownerStore.upsert({ ...upsert, value: upsert.value as unknown as JsonValue });
    opts.persistedReceiptIds.add(objectId);
    added += 1;
  }
  return added;
}
