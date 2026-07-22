import type { JsonValue } from "@qwixl/shell-core";

/** Owner-store category for presentation-board layout (D013: not module-local). */
export const PRESENTATION_BOARD_CATEGORY = "presentation-board";

export const PRESENTATION_BOARD_STATE_LABEL = "Board state";
export const PRESENTATION_BOARD_MUTE_LABEL = "Voice mute";

export type BoardRegion = {
  id: string;
  title: string;
  body?: string;
  pinned?: boolean;
};

export type PresentationBoardState = {
  schemaVersion: 1;
  regions: BoardRegion[];
  updatedAt: number;
};

export function emptyPresentationBoardState(): PresentationBoardState {
  return { schemaVersion: 1, regions: [], updatedAt: Date.now() };
}

export function parsePresentationBoardState(value: JsonValue | undefined): PresentationBoardState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyPresentationBoardState();
  }
  const record = value as Record<string, unknown>;
  const regionsRaw = Array.isArray(record.regions) ? record.regions : [];
  const regions: BoardRegion[] = [];
  for (const item of regionsRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!id || !title) continue;
    regions.push({
      id,
      title,
      body: typeof r.body === "string" ? r.body : undefined,
      pinned: r.pinned === true,
    });
  }
  return {
    schemaVersion: 1,
    regions,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
}
