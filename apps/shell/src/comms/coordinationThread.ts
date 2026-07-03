import {
  COORDINATION_PROPOSAL_PURPOSE,
  COORDINATION_RESPONSE_PURPOSE,
  COORDINATION_RSVP_PURPOSE,
  COORDINATION_RSVP_RESPONSE_PURPOSE,
  COMMS_MESSAGE_PURPOSE,
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

  return null;
}

export function mergeThread(
  inbox: InboxEntryWire[],
  outbound: CommsThreadItem[],
  peerDid: string,
): CommsThreadItem[] {
  const inbound = inbox
    .map((entry) => inboxEntryToThreadItem(entry, peerDid))
    .filter((item): item is CommsThreadItem => item !== null);
  const localOut = outbound.filter((item) => item.peerDid === peerDid);
  const seen = new Set<string>();
  return [...inbound, ...localOut]
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
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

export function formatSchedulingResponse(response: SchedulingResponseKind, slotId?: string): string {
  if (response === "accept") return `Accepted slot ${slotId ?? ""}`.trim();
  if (response === "decline") return "Declined scheduling proposal";
  return "Counter-proposed (not implemented in v1 UI)";
}

export function formatRsvpResponse(response: RsvpAnswer): string {
  if (response === "yes") return "RSVP: Yes";
  if (response === "maybe") return "RSVP: Maybe";
  return "RSVP: No";
}
