import type { CommsThreadItem } from "./types.js";

export type SharedListItem = { id: string; text: string; done: boolean };

export function deriveSharedListStates(
  thread: CommsThreadItem[],
): Map<string, { title: string; items: SharedListItem[] }> {
  const sorted = [...thread].sort((a, b) => a.at.localeCompare(b.at));
  const map = new Map<string, { title: string; items: SharedListItem[] }>();
  for (const item of sorted) {
    if (item.kind === "shared-list") {
      map.set(item.listId, { title: item.title, items: item.items.map((entry) => ({ ...entry })) });
    }
    if (item.kind === "shared-list-update" && item.listId) {
      const prev = map.get(item.listId);
      if (prev) {
        map.set(item.listId, {
          title: item.title ?? prev.title,
          items: item.items.map((entry) => ({ ...entry })),
        });
      }
    }
  }
  return map;
}
