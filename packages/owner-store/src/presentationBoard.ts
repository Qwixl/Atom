import type {
  Composition,
  CompositionNode,
  JsonValue,
  SurfaceBinding,
  SurfacePlacement,
  SurfaceRefresh,
  SurfaceRefreshTrigger,
} from "@qwixl/shell-core";
import { validateComposition } from "@qwixl/shell-core";

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

export interface PersistedSurface {
  surfaceId: string;
  composition: Composition;
  bindings: SurfaceBinding[];
  refresh?: SurfaceRefresh;
  placement: SurfacePlacement;
  /** Fields the owner has overridden; agent arrangement must not touch these. */
  ownerOverrides: Array<"pinned" | "size" | "order" | "screen">;
  /** Per-binding freshness, keyed by `${nodeId}:${prop}`. Successes only — never written on failure. */
  lastRefreshedAt: Record<string, number>;
  /** Per-binding refresh attempts, keyed `${nodeId}:${prop}`. Written on every attempt regardless of outcome. */
  lastAttemptedAt?: Record<string, number>;
  /** Consecutive refresh failures per binding, keyed `${nodeId}:${prop}`. Cleared on success. */
  failureCounts?: Record<string, number>;
  lastError?: { at: number; message: string };
  createdAt: number;
  updatedAt: number;
}

export interface PresentationBoardStateV2 {
  schemaVersion: 2;
  surfaces: PersistedSurface[];
  /** surfaceIds the owner dismissed, with when — agent must not re-pin these. */
  dismissed: Array<{ surfaceId: string; at: number }>;
  updatedAt: number;
}

const OWNER_OVERRIDE_FIELDS = new Set(["pinned", "size", "order", "screen"]);
const SURFACE_FORMATS = new Set(["text", "number", "date", "list", "table"]);
const SURFACE_SIZES = new Set(["s", "m", "l"]);

export function emptyPresentationBoardState(): PresentationBoardState {
  return { schemaVersion: 1, regions: [], updatedAt: Date.now() };
}

export function emptyPresentationBoardStateV2(): PresentationBoardStateV2 {
  return { schemaVersion: 2, surfaces: [], dismissed: [], updatedAt: Date.now() };
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectNodeIds(node: CompositionNode, ids: Set<string>): void {
  ids.add(node.id);
  for (const child of node.children ?? []) {
    collectNodeIds(child, ids);
  }
}

function bindingKey(binding: SurfaceBinding): string {
  return `${binding.nodeId}:${binding.prop}`;
}

function parseBinding(value: unknown, nodeIds: Set<string>): SurfaceBinding | null {
  if (!isPlainObject(value)) return null;
  const nodeId = typeof value.nodeId === "string" ? value.nodeId.trim() : "";
  const prop = typeof value.prop === "string" ? value.prop.trim() : "";
  if (!nodeId || !nodeIds.has(nodeId) || !prop) return null;
  if (!isPlainObject(value.source)) return null;
  const connector =
    typeof value.source.connector === "string" ? value.source.connector.trim() : "";
  const tool = typeof value.source.tool === "string" ? value.source.tool.trim() : "";
  if (!connector || !tool) return null;
  if (
    value.source.args !== undefined &&
    (!isPlainObject(value.source.args) || Array.isArray(value.source.args))
  ) {
    return null;
  }
  if (value.select !== undefined && typeof value.select !== "string") return null;
  if (value.format !== undefined) {
    if (typeof value.format !== "string" || !SURFACE_FORMATS.has(value.format)) return null;
  }
  const format =
    typeof value.format === "string" && SURFACE_FORMATS.has(value.format) ? value.format : undefined;
  let columns: string[] | undefined;
  if (value.columns !== undefined) {
    if (format !== "table") return null;
    if (!Array.isArray(value.columns) || value.columns.length === 0) return null;
    if (value.columns.length > 16) return null;
    columns = [];
    for (const column of value.columns) {
      if (typeof column !== "string" || column.length === 0) return null;
      if (column === "__proto__" || column === "constructor") return null;
      columns.push(column);
    }
  } else if (format === "table") {
    return null;
  }
  const binding: SurfaceBinding = {
    nodeId,
    prop,
    source: { connector, tool },
  };
  if (value.source.args !== undefined) {
    binding.source.args = value.source.args as Record<string, unknown>;
  }
  if (value.select !== undefined) binding.select = value.select;
  if (value.format !== undefined) binding.format = value.format as SurfaceBinding["format"];
  if (columns) binding.columns = columns;
  return binding;
}

function parseRefreshTrigger(value: unknown): SurfaceRefreshTrigger | null {
  if (!isPlainObject(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "interval":
      if (typeof value.everyMinutes !== "number" || !Number.isFinite(value.everyMinutes)) return null;
      return { type: "interval", everyMinutes: value.everyMinutes };
    case "daily-time":
      if (typeof value.time !== "string" || value.time.length === 0) return null;
      return { type: "daily-time", time: value.time };
    case "on-open":
      return { type: "on-open" };
    case "connector-change": {
      const connector = typeof value.connector === "string" ? value.connector.trim() : "";
      if (!connector) return null;
      return { type: "connector-change", connector };
    }
    default:
      return null;
  }
}

function parseRefresh(value: unknown): SurfaceRefresh | null | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return null;
  const trigger = parseRefreshTrigger(value.trigger);
  if (!trigger) return null;
  if (
    typeof value.staleAfterSeconds !== "number" ||
    !Number.isFinite(value.staleAfterSeconds) ||
    value.staleAfterSeconds <= 0
  ) {
    return null;
  }
  if (value.expiresAfterSeconds !== undefined) {
    if (
      typeof value.expiresAfterSeconds !== "number" ||
      !Number.isFinite(value.expiresAfterSeconds) ||
      value.expiresAfterSeconds <= 0
    ) {
      return null;
    }
  }
  const refresh: SurfaceRefresh = { trigger, staleAfterSeconds: value.staleAfterSeconds };
  if (value.expiresAfterSeconds !== undefined) {
    refresh.expiresAfterSeconds = value.expiresAfterSeconds;
  }
  return refresh;
}

function parsePlacement(value: unknown): SurfacePlacement | null {
  if (!isPlainObject(value)) return null;
  const placement: SurfacePlacement = {};
  if (value.screen !== undefined) {
    if (typeof value.screen !== "number" || !Number.isInteger(value.screen) || value.screen < 0) {
      return null;
    }
    placement.screen = value.screen;
  }
  if (value.order !== undefined) {
    if (typeof value.order !== "number" || !Number.isInteger(value.order) || value.order < 0) {
      return null;
    }
    placement.order = value.order;
  }
  if (value.size !== undefined) {
    if (typeof value.size !== "string" || !SURFACE_SIZES.has(value.size)) return null;
    placement.size = value.size as SurfacePlacement["size"];
  }
  if (value.pinned !== undefined) {
    if (typeof value.pinned !== "boolean") return null;
    placement.pinned = value.pinned;
  }
  return placement;
}

function parseOwnerOverrides(value: unknown): Array<"pinned" | "size" | "order" | "screen"> {
  if (!Array.isArray(value)) return [];
  const overrides: Array<"pinned" | "size" | "order" | "screen"> = [];
  for (const item of value) {
    if (typeof item === "string" && OWNER_OVERRIDE_FIELDS.has(item)) {
      overrides.push(item as "pinned" | "size" | "order" | "screen");
    }
  }
  return overrides;
}

function parseFailureCounts(
  value: unknown,
  bindingKeys: ReadonlySet<string>,
): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return undefined;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (!bindingKeys.has(key)) continue;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) continue;
    result[key] = count;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseLastAttemptedAt(
  value: unknown,
  bindingKeys: ReadonlySet<string>,
): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return undefined;
  const result: Record<string, number> = {};
  for (const [key, at] of Object.entries(value)) {
    if (!bindingKeys.has(key)) continue;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    result[key] = at;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseLastRefreshedAt(
  value: unknown,
  bindingKeys: ReadonlySet<string>,
): Record<string, number> {
  if (!isPlainObject(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, at] of Object.entries(value)) {
    if (!bindingKeys.has(key)) continue;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    result[key] = at;
  }
  return result;
}

/**
 * A partially invalid binding list would produce a tile that cannot refresh some
 * props — skip the whole surface rather than pruning bindings silently.
 */
function parsePersistedSurface(value: unknown): PersistedSurface | null {
  if (!isPlainObject(value)) return null;
  const surfaceId = typeof value.surfaceId === "string" ? value.surfaceId.trim() : "";
  if (!surfaceId) return null;

  // `UiEvent.surfaceId` and consequential-action outputs correlate through
  // `composition.surfaceId`, so a tile with two identities would let an owner control
  // act on one surface while reporting another. They must be the same value.
  const compositionResult = validateComposition(value.composition);
  if (!compositionResult.ok || compositionResult.value.surfaceId !== surfaceId) return null;

  const nodeIds = new Set<string>();
  collectNodeIds(compositionResult.value.root, nodeIds);

  if (!Array.isArray(value.bindings)) return null;
  const bindings: SurfaceBinding[] = [];
  for (const rawBinding of value.bindings) {
    const binding = parseBinding(rawBinding, nodeIds);
    if (!binding) return null;
    bindings.push(binding);
  }

  const refresh = parseRefresh(value.refresh);
  if (refresh === null) return null;

  const placement = parsePlacement(value.placement);
  if (!placement) return null;

  if (
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }

  let lastError: { at: number; message: string } | undefined;
  if (value.lastError !== undefined) {
    if (!isPlainObject(value.lastError)) return null;
    if (
      typeof value.lastError.at !== "number" ||
      !Number.isFinite(value.lastError.at) ||
      typeof value.lastError.message !== "string" ||
      value.lastError.message.length === 0
    ) {
      return null;
    }
    lastError = { at: value.lastError.at, message: value.lastError.message };
  }

  const bindingKeys = new Set(bindings.map(bindingKey));
  const lastRefreshedAt = parseLastRefreshedAt(value.lastRefreshedAt, bindingKeys);
  const lastAttemptedAt = parseLastAttemptedAt(value.lastAttemptedAt, bindingKeys);
  const failureCounts = parseFailureCounts(value.failureCounts, bindingKeys);

  const surface: PersistedSurface = {
    surfaceId,
    composition: compositionResult.value,
    bindings,
    placement,
    ownerOverrides: parseOwnerOverrides(value.ownerOverrides),
    lastRefreshedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  if (refresh) surface.refresh = refresh;
  if (lastError) surface.lastError = lastError;
  if (lastAttemptedAt) surface.lastAttemptedAt = lastAttemptedAt;
  if (failureCounts) surface.failureCounts = failureCounts;
  return surface;
}

function parseDismissed(value: unknown): PresentationBoardStateV2["dismissed"] {
  if (!Array.isArray(value)) return [];
  const dismissed: PresentationBoardStateV2["dismissed"] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    const surfaceId = typeof item.surfaceId === "string" ? item.surfaceId.trim() : "";
    if (!surfaceId || typeof item.at !== "number" || !Number.isFinite(item.at)) continue;
    dismissed.push({ surfaceId, at: item.at });
  }
  return dismissed;
}

function migratePresentationBoardV1(record: Record<string, unknown>): PresentationBoardStateV2 {
  return {
    schemaVersion: 2,
    surfaces: [],
    dismissed: [],
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
}

export function parsePresentationBoardStateV2(value: JsonValue | undefined): PresentationBoardStateV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyPresentationBoardStateV2();
  }
  const record = value as Record<string, unknown>;
  const schemaVersion = record.schemaVersion;

  if (schemaVersion === 1 || schemaVersion === undefined) {
    return migratePresentationBoardV1(record);
  }
  if (schemaVersion !== 2) {
    return emptyPresentationBoardStateV2();
  }

  const surfaces: PersistedSurface[] = [];
  if (Array.isArray(record.surfaces)) {
    for (const item of record.surfaces) {
      const surface = parsePersistedSurface(item);
      if (surface) surfaces.push(surface);
    }
  }

  return {
    schemaVersion: 2,
    surfaces,
    dismissed: parseDismissed(record.dismissed),
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
}
