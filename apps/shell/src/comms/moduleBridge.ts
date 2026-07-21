import type { SchedulingSlot } from "@qwixl/a2a-transport";

export const COMMS_MODULE_BRIDGE_KEY = "atom-comms-module-bridge";

export type CommsModuleBridge =
  | { action: "meetingProposed"; title: string; slots: SchedulingSlot[] }
  | { action: "pollCreated"; question: string; options: Array<{ id: string; label: string }> }
  | {
      action: "rsvpCreated";
      eventTitle: string;
      eventAt: string;
      location?: string;
    }
  | {
      action: "introCreated";
      displayName: string;
      oneLiner: string;
      interests?: string[];
    }
  | {
      action: "listCreated";
      title: string;
      items: Array<{ id: string; text: string; done: boolean }>;
    }
  | {
      action: "locationPinCreated";
      label: string;
      lat: number;
      lng: number;
      note?: string;
    }
  | {
      action: "splitProposed";
      label: string;
      totalMinor: number;
      currency: string;
      splitCount: number;
      shareMinor: number;
    }
  | { action: "tttStart"; gameId: string }
  | { action: "bsStart"; gameId: string }
  | { action: "bsMove"; gameId: string; move: { action: "place"; cells: number[] } | { action: "fire"; cell: number } }
  | { action: "bsCommit"; gameId: string; cells: number[] };

export function queueCommsModuleBridge(payload: CommsModuleBridge): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(COMMS_MODULE_BRIDGE_KEY, JSON.stringify(payload));
}

export function takeCommsModuleBridge(): CommsModuleBridge | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(COMMS_MODULE_BRIDGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(COMMS_MODULE_BRIDGE_KEY);
  try {
    return JSON.parse(raw) as CommsModuleBridge;
  } catch {
    return null;
  }
}

/** Map chat feed module events to Messages actions. Returns true if handled. */
export function bridgeChatModuleEvent(
  name: string,
  payload: Record<string, unknown> | undefined,
): boolean {
  if (name === "meetingProposed") {
    const title = typeof payload?.title === "string" ? payload.title : "Meeting";
    const slots = Array.isArray(payload?.slots) ? (payload.slots as SchedulingSlot[]) : [];
    if (slots.length === 0) return false;
    queueCommsModuleBridge({ action: "meetingProposed", title, slots });
    return true;
  }
  if (name === "pollCreated") {
    const question = typeof payload?.question === "string" ? payload.question : "";
    const options = Array.isArray(payload?.options)
      ? payload.options.filter(
          (o): o is { id: string; label: string } =>
            !!o && typeof o === "object" && typeof (o as { id?: string }).id === "string",
        )
      : [];
    if (!question || options.length < 2) return false;
    queueCommsModuleBridge({ action: "pollCreated", question, options });
    return true;
  }
  if (name === "rsvpCreated") {
    const eventTitle = typeof payload?.eventTitle === "string" ? payload.eventTitle : "";
    const eventAt = typeof payload?.eventAt === "string" ? payload.eventAt : "";
    const location = typeof payload?.location === "string" ? payload.location : undefined;
    if (!eventTitle || !eventAt) return false;
    queueCommsModuleBridge({ action: "rsvpCreated", eventTitle, eventAt, location });
    return true;
  }
  if (name === "introCreated") {
    const displayName = typeof payload?.displayName === "string" ? payload.displayName : "";
    const oneLiner = typeof payload?.oneLiner === "string" ? payload.oneLiner : "";
    const interests = Array.isArray(payload?.interests)
      ? payload.interests.filter((t): t is string => typeof t === "string")
      : undefined;
    if (!displayName || !oneLiner) return false;
    queueCommsModuleBridge({ action: "introCreated", displayName, oneLiner, interests });
    return true;
  }
  if (name === "listCreated") {
    const title = typeof payload?.title === "string" ? payload.title : "Shared list";
    const items = Array.isArray(payload?.items)
      ? payload.items.filter(
          (entry): entry is { id: string; text: string; done: boolean } =>
            !!entry &&
            typeof entry === "object" &&
            typeof (entry as { id?: string }).id === "string" &&
            typeof (entry as { text?: string }).text === "string" &&
            typeof (entry as { done?: boolean }).done === "boolean",
        )
      : [];
    if (items.length === 0) return false;
    queueCommsModuleBridge({ action: "listCreated", title, items });
    return true;
  }
  if (name === "locationPinCreated") {
    const label = typeof payload?.label === "string" ? payload.label : "Meeting point";
    const lat = typeof payload?.lat === "number" ? payload.lat : Number.NaN;
    const lng = typeof payload?.lng === "number" ? payload.lng : Number.NaN;
    const note = typeof payload?.note === "string" ? payload.note : undefined;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    queueCommsModuleBridge({ action: "locationPinCreated", label, lat, lng, note });
    return true;
  }
  if (name === "splitProposed") {
    const label = typeof payload?.label === "string" ? payload.label : "Split bill";
    const totalMinor = typeof payload?.totalMinor === "number" ? payload.totalMinor : 0;
    const currency = typeof payload?.currency === "string" ? payload.currency : "USD";
    const splitCount = typeof payload?.splitCount === "number" ? payload.splitCount : 2;
    const shareMinor = typeof payload?.shareMinor === "number" ? payload.shareMinor : 0;
    if (totalMinor <= 0 || shareMinor <= 0) return false;
    queueCommsModuleBridge({
      action: "splitProposed",
      label,
      totalMinor,
      currency,
      splitCount,
      shareMinor,
    });
    return true;
  }
  if (name === "tttStart") {
    const gameId = typeof payload?.gameId === "string" ? payload.gameId : `ttt-${Date.now()}`;
    queueCommsModuleBridge({ action: "tttStart", gameId });
    return true;
  }
  if (name === "bsStart") {
    const gameId = typeof payload?.gameId === "string" ? payload.gameId : `bs-${Date.now()}`;
    queueCommsModuleBridge({ action: "bsStart", gameId });
    return true;
  }
  if (name === "bsMove") {
    const gameId = typeof payload?.gameId === "string" ? payload.gameId : "";
    const action = payload?.action === "fire" ? "fire" : payload?.action === "place" ? "place" : null;
    if (!gameId || !action) return false;
    if (action === "place") {
      const cells = Array.isArray(payload?.cells)
        ? payload.cells.filter((cell): cell is number => typeof cell === "number")
        : [];
      if (cells.length === 0) return false;
      queueCommsModuleBridge({ action: "bsMove", gameId, move: { action: "place", cells } });
      return true;
    }
    const cell = typeof payload?.cell === "number" ? payload.cell : -1;
    if (cell < 0) return false;
    queueCommsModuleBridge({ action: "bsMove", gameId, move: { action: "fire", cell } });
    return true;
  }
  if (name === "bsCommit") {
    const gameId = typeof payload?.gameId === "string" ? payload.gameId : "";
    const cells = Array.isArray(payload?.cells)
      ? payload.cells.filter((cell): cell is number => typeof cell === "number")
      : [];
    if (!gameId || cells.length === 0) return false;
    queueCommsModuleBridge({ action: "bsCommit", gameId, cells });
    return true;
  }
  return false;
}
