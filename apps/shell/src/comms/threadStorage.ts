import { loadJsonFromStorage, saveJsonToStorage } from "@qwixl/shell-core";
import type { CommsThreadItem } from "./types.js";

const OUTBOUND_KEY = "atom-comms-thread-outbound";
const MAX_ITEMS = 500;

function isThreadItem(value: unknown): value is CommsThreadItem {
  if (!value || typeof value !== "object") return false;
  const item = value as CommsThreadItem;
  return (
    typeof item.id === "string" &&
    typeof item.at === "string" &&
    typeof item.peerDid === "string" &&
    (item.direction === "in" || item.direction === "out") &&
    typeof item.kind === "string"
  );
}

export function loadThreadOutbound(): CommsThreadItem[] {
  const parsed = loadJsonFromStorage<CommsThreadItem[]>(OUTBOUND_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isThreadItem).slice(-MAX_ITEMS);
}

export function saveThreadOutbound(items: CommsThreadItem[]): void {
  saveJsonToStorage(OUTBOUND_KEY, items.slice(-MAX_ITEMS));
}
