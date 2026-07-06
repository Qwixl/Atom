import {
  COORDINATION_PROPOSAL_PURPOSE,
  COORDINATION_RESPONSE_PURPOSE,
  COORDINATION_RSVP_PURPOSE,
  COORDINATION_RSVP_RESPONSE_PURPOSE,
  ACTION_RESERVE_PURPOSE,
  ACTION_HOLD_PURPOSE,
  ACTION_CONFIRM_PURPOSE,
  ACTION_CAPTURE_PURPOSE,
  ACTION_RELEASE_PURPOSE,
  ACTION_RECEIPT_PURPOSE,
  COMMERCE_INTENT_PURPOSE,
  COMMERCE_OFFER_PURPOSE,
  COMMERCE_DECLINE_PURPOSE,
  COMMS_MESSAGE_PURPOSE,
  type ActionReserveRefKind,
  type MonetaryAmount,
  type RsvpAnswer,
  type SchedulingResponseKind,
  type SchedulingSlot,
} from "@qwixl/a2a-transport";
import type { CommsThreadItem, InboxEntryWire } from "./types.js";

function entryAt(entry: InboxEntryWire): string {
  return entry.receivedAt || entry.object.issuedAt;
}

function parseSlots(raw: unknown): SchedulingSlot[] {
  if (!Array.isArray(raw)) return [];
  const slots: SchedulingSlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const slot = item as SchedulingSlot;
    if (
      typeof slot.id === "string" &&
      typeof slot.label === "string" &&
      typeof slot.start === "string" &&
      typeof slot.end === "string"
    ) {
      slots.push(slot);
    }
  }
  return slots;
}

function parseAmount(raw: unknown): MonetaryAmount | null {
  if (!raw || typeof raw !== "object") return null;
  const amount = raw as Partial<MonetaryAmount>;
  if (typeof amount.currency !== "string" || typeof amount.amountMinor !== "number") return null;
  return { currency: amount.currency, amountMinor: amount.amountMinor };
}

export function formatMonetaryAmount(amount: MonetaryAmount): string {
  return `${(amount.amountMinor / 100).toFixed(2)} ${amount.currency}`;
}

export function inboxEntryToThreadItem(
  entry: InboxEntryWire,
  peerDid: string,
): CommsThreadItem | null {
  if (entry.object.issuerDid !== peerDid) return null;
  const purpose = entry.object.governance.purpose;
  const at = entryAt(entry);
  const id = entry.object.id;
  const payload = entry.object.payload;

  if (purpose === COMMS_MESSAGE_PURPOSE) {
    const text = typeof payload.text === "string" ? payload.text : "";
    return { kind: "message", id, direction: "in", text, at, peerDid };
  }

  if (purpose === COORDINATION_PROPOSAL_PURPOSE) {
    const title = typeof payload.title === "string" ? payload.title : "Scheduling proposal";
    return {
      kind: "scheduling-proposal",
      id,
      direction: "in",
      at,
      peerDid,
      title,
      slots: parseSlots(payload.slots),
    };
  }

  if (purpose === COORDINATION_RESPONSE_PURPOSE) {
    const response = payload.response as SchedulingResponseKind;
    if (response !== "accept" && response !== "decline" && response !== "counter") return null;
    return {
      kind: "scheduling-response",
      id,
      direction: "in",
      at,
      peerDid,
      proposalId: String(payload.proposalId ?? ""),
      response,
      slotId: typeof payload.slotId === "string" ? payload.slotId : undefined,
    };
  }

  if (purpose === COORDINATION_RSVP_PURPOSE) {
    return {
      kind: "rsvp-request",
      id,
      direction: "in",
      at,
      peerDid,
      eventTitle: typeof payload.eventTitle === "string" ? payload.eventTitle : "Event",
      eventAt: typeof payload.eventAt === "string" ? payload.eventAt : "",
      location: typeof payload.location === "string" ? payload.location : undefined,
    };
  }

  if (purpose === COORDINATION_RSVP_RESPONSE_PURPOSE) {
    const response = payload.response as RsvpAnswer;
    if (response !== "yes" && response !== "maybe" && response !== "no") return null;
    return {
      kind: "rsvp-response",
      id,
      direction: "in",
      at,
      peerDid,
      rsvpId: String(payload.rsvpId ?? ""),
      response,
    };
  }

  if (purpose === ACTION_RESERVE_PURPOSE) {
    const refKind = payload.refKind as ActionReserveRefKind;
    if (
      refKind !== "scheduling-proposal" &&
      refKind !== "scheduling-slot" &&
      refKind !== "rsvp" &&
      refKind !== "generic"
    ) {
      return null;
    }
    return {
      kind: "action-reserve",
      id,
      direction: "in",
      at,
      peerDid,
      refId: String(payload.refId ?? ""),
      refKind,
      label: typeof payload.label === "string" ? payload.label : String(payload.refId ?? "Reserved"),
      attestationRef: String(payload.attestationRef ?? ""),
    };
  }

  if (purpose === ACTION_HOLD_PURPOSE) {
    const amount = parseAmount(payload.amount);
    if (!amount) return null;
    return {
      kind: "transaction-hold",
      id,
      direction: "in",
      at,
      peerDid,
      transactionId: String(payload.transactionId ?? ""),
      amount,
      label: typeof payload.label === "string" ? payload.label : undefined,
      rail: typeof payload.rail === "string" ? payload.rail : "unknown",
      expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : undefined,
    };
  }

  if (purpose === ACTION_CONFIRM_PURPOSE) {
    const amount = parseAmount(payload.amount);
    if (!amount) return null;
    const role = payload.role;
    if (role !== "payer" && role !== "payee") return null;
    return {
      kind: "transaction-confirm",
      id,
      direction: "in",
      at,
      peerDid,
      transactionId: String(payload.transactionId ?? ""),
      role,
      amount,
      label: typeof payload.label === "string" ? payload.label : undefined,
    };
  }

  if (purpose === ACTION_CAPTURE_PURPOSE) {
    const amount = parseAmount(payload.amount);
    return {
      kind: "transaction-status",
      id,
      direction: "in",
      at,
      peerDid,
      transactionId: String(payload.transactionId ?? ""),
      status: "capture",
      amount: amount ?? undefined,
    };
  }

  if (purpose === ACTION_RECEIPT_PURPOSE) {
    const amount = parseAmount(payload.amount);
    return {
      kind: "transaction-status",
      id,
      direction: "in",
      at,
      peerDid,
      transactionId: String(payload.transactionId ?? ""),
      status: "receipt",
      amount: amount ?? undefined,
    };
  }

  if (purpose === ACTION_RELEASE_PURPOSE) {
    return {
      kind: "transaction-status",
      id,
      direction: "in",
      at,
      peerDid,
      transactionId: String(payload.transactionId ?? ""),
      status: "release",
      reason: typeof payload.reason === "string" ? payload.reason : undefined,
    };
  }

  if (purpose === COMMERCE_INTENT_PURPOSE) {
    return {
      kind: "commerce-intent",
      id,
      direction: "in",
      at,
      peerDid,
      intentId: String(payload.intentId ?? ""),
      catalogItemId: typeof payload.catalogItemId === "string" ? payload.catalogItemId : undefined,
      query: typeof payload.query === "string" ? payload.query : undefined,
    };
  }

  if (purpose === COMMERCE_OFFER_PURPOSE) {
    const amount = parseAmount(payload.amount);
    if (!amount) return null;
    const terms = Array.isArray(payload.terms)
      ? payload.terms.filter((t): t is string => typeof t === "string")
      : [];
    return {
      kind: "commerce-offer",
      id,
      direction: "in",
      at,
      peerDid,
      offerId: String(payload.offerId ?? ""),
      intentId: String(payload.intentId ?? ""),
      catalogItemId: String(payload.catalogItemId ?? ""),
      label: typeof payload.label === "string" ? payload.label : "Offer",
      amount,
      available: payload.available === true,
      terms,
      sponsored: payload.sponsored === true,
    };
  }

  if (purpose === COMMERCE_DECLINE_PURPOSE) {
    return {
      kind: "commerce-decline",
      id,
      direction: "in",
      at,
      peerDid,
      intentId: String(payload.intentId ?? ""),
      reasonCode: String(payload.reasonCode ?? "other"),
      note: typeof payload.note === "string" ? payload.note : undefined,
    };
  }

  return null;
}

/** Derive a locale time label from a wire slot id (e.g. slot-2026-07-07T09:00:00.000Z). */
export function humanizeSlotId(slotId?: string): string | undefined {
  if (!slotId) return undefined;
  const iso = slotId.startsWith("slot-") ? slotId.slice("slot-".length) : slotId;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function enrichSchedulingResponseLabels(
  item: Extract<CommsThreadItem, { kind: "scheduling-response" }>,
  proposals: Map<string, SchedulingSlot[]>,
): CommsThreadItem {
  if (item.response !== "accept" || item.slotLabel) return item;
  const slots = proposals.get(item.proposalId);
  const matching = item.slotId ? slots?.find((slot) => slot.id === item.slotId) : undefined;
  const slotLabel = matching?.label ?? humanizeSlotId(item.slotId);
  if (!slotLabel) return item;
  return { ...item, slotLabel };
}

/** Attach human-facing slot labels to scheduling responses for UI display. */
export function enrichThreadHumanLabels(items: CommsThreadItem[]): CommsThreadItem[] {
  const proposals = new Map<string, SchedulingSlot[]>();
  for (const item of items) {
    if (item.kind === "scheduling-proposal") {
      proposals.set(item.id, item.slots);
    }
  }
  return items.map((item) =>
    item.kind === "scheduling-response" ? enrichSchedulingResponseLabels(item, proposals) : item,
  );
}

export function mergeThread(
  inbox: InboxEntryWire[],
  outbound: CommsThreadItem[],
  peerDid: string,
  order: "asc" | "desc" = "asc",
): CommsThreadItem[] {
  const inbound = inbox
    .map((entry) => inboxEntryToThreadItem(entry, peerDid))
    .filter((item): item is CommsThreadItem => item !== null);
  const localOut = outbound.filter((item) => item.peerDid === peerDid);
  const seen = new Set<string>();
  return enrichThreadHumanLabels(
    [...inbound, ...localOut]
      .filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => (order === "desc" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at))),
  );
}

/** Demo standup slots for M8 organizer actions. */
export function defaultStandupSlots(): SchedulingSlot[] {
  return [
    {
      id: "tue-10",
      label: "Tue · 10:00–10:30",
      start: "2026-07-08T10:00:00.000Z",
      end: "2026-07-08T10:30:00.000Z",
    },
    {
      id: "wed-14",
      label: "Wed · 14:00–14:30",
      start: "2026-07-09T14:00:00.000Z",
      end: "2026-07-09T14:30:00.000Z",
    },
    {
      id: "thu-09",
      label: "Thu · 09:00–09:30",
      start: "2026-07-10T09:00:00.000Z",
      end: "2026-07-10T09:30:00.000Z",
    },
  ];
}

export function formatSchedulingResponse(
  response: SchedulingResponseKind,
  opts?: { slotId?: string; slotLabel?: string },
): string {
  if (response === "accept") {
    const label = opts?.slotLabel ?? humanizeSlotId(opts?.slotId);
    return label ? `Accepted: ${label}` : "Accepted meeting time";
  }
  if (response === "decline") return "Declined scheduling proposal";
  return "Counter-proposed (not implemented in v1 UI)";
}

export function formatRsvpResponse(response: RsvpAnswer): string {
  if (response === "yes") return "RSVP: Yes";
  if (response === "maybe") return "RSVP: Maybe";
  return "RSVP: No";
}
