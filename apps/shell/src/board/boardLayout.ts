import type { PersistedSurface } from "@qwixl/owner-store";
import type {
  CompositionNode,
  JsonValue,
  ResolvedNode,
  ResolvedSurface,
  SurfaceBinding,
  SurfacePlacement,
} from "@qwixl/shell-core";
import { formatIso8601ForDisplay, type WebcalDisplayFormatOptions } from "../connectors/webcalDateDisplay.js";

export type BoardTileSize = "s" | "m" | "l";

export type EffectivePlacement = {
  screen: number;
  order: number;
  size: BoardTileSize;
  pinned: boolean;
};

export type LayoutBoardTile = {
  surface: PersistedSurface;
  placement: EffectivePlacement;
};

export type LayoutBoardScreen = {
  screen: number;
  tiles: LayoutBoardTile[];
};

export type TileAsOf = { kind: "never-refreshed" } | { kind: "as-of"; at: number };

const DEFAULT_SIZE: BoardTileSize = "m";
const SIZE_CYCLE: BoardTileSize[] = ["s", "m", "l"];

export function bindingKey(binding: SurfaceBinding): string {
  return `${binding.nodeId}:${binding.prop}`;
}

export function addOwnerOverride(
  overrides: PersistedSurface["ownerOverrides"],
  field: PersistedSurface["ownerOverrides"][number],
): PersistedSurface["ownerOverrides"] {
  if (overrides.includes(field)) return overrides;
  return [...overrides, field];
}

/** Owner overrides beat agent arrangement for fields listed in ownerOverrides. */
export function effectivePlacement(
  surface: PersistedSurface,
  agentPlacement?: SurfacePlacement,
): EffectivePlacement {
  const base = surface.placement;
  const overrides = new Set(surface.ownerOverrides);
  const agent = agentPlacement ?? {};
  return {
    screen: overrides.has("screen")
      ? (base.screen ?? 0)
      : (agent.screen ?? base.screen ?? 0),
    order: overrides.has("order") ? (base.order ?? 0) : (agent.order ?? base.order ?? 0),
    size: overrides.has("size")
      ? (base.size ?? DEFAULT_SIZE)
      : (agent.size ?? base.size ?? DEFAULT_SIZE),
    pinned: overrides.has("pinned")
      ? (base.pinned ?? false)
      : (agent.pinned ?? base.pinned ?? false),
  };
}

export function maxPersistedScreen(surfaces: readonly PersistedSurface[]): number {
  let max = 0;
  for (const surface of surfaces) {
    max = Math.max(max, effectivePlacement(surface).screen);
  }
  return max;
}

/** Agent arrangement may append one new screen beyond the current highest. */
export function maxAllowedAgentScreen(maxOccupiedScreenIndex: number): number {
  return Math.max(0, maxOccupiedScreenIndex) + 1;
}

export function clampAgentScreen(screen: number, maxOccupiedScreenIndex: number): number {
  return Math.min(Math.max(0, screen), maxAllowedAgentScreen(maxOccupiedScreenIndex));
}

export const BOARD_TILE_TITLE_MAX_LENGTH = 80;

/** Agent-authored title chrome: plain text, single line, length-capped (invariant 7). */
export function formatBoardTileTitle(intent: string | undefined, surfaceId: string): string {
  const raw = (intent?.trim() || surfaceId).replace(/\s+/g, " ").trim();
  if (raw.length <= BOARD_TILE_TITLE_MAX_LENGTH) return raw;
  return `${raw.slice(0, BOARD_TILE_TITLE_MAX_LENGTH - 1)}…`;
}

export function boardPanelSections(options: {
  v1RegionCount: number;
  v2SurfaceCount: number;
}): { showV2Board: boolean; showV1Module: boolean; showEmpty: boolean } {
  const showV2Board = options.v2SurfaceCount > 0;
  const showV1Module = options.v1RegionCount > 0;
  return {
    showV2Board,
    showV1Module,
    showEmpty: !showV2Board && !showV1Module,
  };
}

/**
 * As-of for the frame uses the oldest binding timestamp so the tile is never
 * presented fresher than its stalest visible value. Any missing binding entry
 * means never-refreshed — never fall back to now.
 */
export function tileAsOf(
  bindings: readonly SurfaceBinding[],
  lastRefreshedAt: Readonly<Record<string, number>>,
): TileAsOf {
  if (bindings.length === 0) return { kind: "never-refreshed" };
  let oldest: number | undefined;
  for (const binding of bindings) {
    const at = lastRefreshedAt[bindingKey(binding)];
    if (at === undefined || !Number.isFinite(at)) {
      return { kind: "never-refreshed" };
    }
    oldest = oldest === undefined ? at : Math.min(oldest, at);
  }
  return { kind: "as-of", at: oldest! };
}

export function isTileStale(
  refresh: PersistedSurface["refresh"],
  bindings: readonly SurfaceBinding[],
  lastRefreshedAt: Readonly<Record<string, number>>,
  now: number,
): boolean {
  const asOf = tileAsOf(bindings, lastRefreshedAt);
  if (asOf.kind === "never-refreshed") return true;
  if (!refresh) return false;
  return now - asOf.at > refresh.staleAfterSeconds * 1000;
}

/** Provenance source names — from persisted bindings only, never composition props. */
export function provenanceConnectorLabels(bindings: readonly SurfaceBinding[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const binding of bindings) {
    const connector = binding.source.connector;
    if (!seen.has(connector)) {
      seen.add(connector);
      labels.push(connector);
    }
  }
  return labels;
}

export function layoutBoardScreens(
  surfaces: readonly PersistedSurface[],
  agentPlacements: Record<string, SurfacePlacement> = {},
): LayoutBoardScreen[] {
  const maxOccupied = maxPersistedScreen(surfaces);
  const tiles: LayoutBoardTile[] = surfaces.map((surface) => {
    const agent = agentPlacements[surface.surfaceId];
    let placement = effectivePlacement(surface, agent);
    if (!surface.ownerOverrides.includes("screen")) {
      placement = { ...placement, screen: clampAgentScreen(placement.screen, maxOccupied) };
    }
    return { surface, placement };
  });

  const byScreen = new Map<number, LayoutBoardTile[]>();
  for (const tile of tiles) {
    const list = byScreen.get(tile.placement.screen) ?? [];
    list.push(tile);
    byScreen.set(tile.placement.screen, list);
  }

  return [...byScreen.keys()]
    .sort((a, b) => a - b)
    .map((screen) => ({
      screen,
      tiles: (byScreen.get(screen) ?? []).sort((a, b) => a.placement.order - b.placement.order),
    }));
}

export function nextBoardTileSize(size: BoardTileSize): BoardTileSize {
  const index = SIZE_CYCLE.indexOf(size);
  return SIZE_CYCLE[(index + 1) % SIZE_CYCLE.length] ?? DEFAULT_SIZE;
}

export function applyOwnerPin(surface: PersistedSurface, pinned: boolean): PersistedSurface {
  return {
    ...surface,
    placement: { ...surface.placement, pinned },
    ownerOverrides: addOwnerOverride(surface.ownerOverrides, "pinned"),
    updatedAt: Date.now(),
  };
}

export function applyOwnerSize(surface: PersistedSurface, size: BoardTileSize): PersistedSurface {
  return {
    ...surface,
    placement: { ...surface.placement, size },
    ownerOverrides: addOwnerOverride(surface.ownerOverrides, "size"),
    updatedAt: Date.now(),
  };
}

export function applyOwnerReorder(
  surface: PersistedSurface,
  screen: number,
  order: number,
): PersistedSurface {
  return {
    ...surface,
    placement: {
      ...surface.placement,
      screen: Math.max(0, screen),
      order: Math.max(0, order),
    },
    ownerOverrides: addOwnerOverride(
      addOwnerOverride(surface.ownerOverrides, "order"),
      "screen",
    ),
    updatedAt: Date.now(),
  };
}

export type BoardDisplayFormatOptions = WebcalDisplayFormatOptions;

/** Formats a single table cell for Board display; non-ISO values pass through unchanged. */
export function formatBoardTableCellDisplay(
  value: unknown,
  options?: BoardDisplayFormatOptions,
): unknown {
  if (typeof value !== "string") return value;
  return formatIso8601ForDisplay(value, options) ?? value;
}

function formatTableNodeRows(
  node: CompositionNode,
  options?: BoardDisplayFormatOptions,
): CompositionNode {
  if (node.component !== "core/table" || !node.props) return node;
  const rows = node.props.rows;
  if (!Array.isArray(rows)) return node;
  const formattedRows = rows.map((row) => {
    if (!Array.isArray(row)) return row;
    return row.map((cell) => formatBoardTableCellDisplay(cell, options));
  }) as JsonValue;
  return {
    ...node,
    props: {
      ...node.props,
      rows: formattedRows,
    },
  };
}

function formatResolvedNodeDisplay(
  resolved: ResolvedNode,
  options?: BoardDisplayFormatOptions,
): ResolvedNode {
  const formattedNode = formatTableNodeRows(resolved.node, options);
  const children = resolved.children.map((child) => formatResolvedNodeDisplay(child, options));
  const nodeChanged = formattedNode !== resolved.node;
  const childrenChanged = children.some((child, index) => child !== resolved.children[index]);
  if (!nodeChanged && !childrenChanged) return resolved;
  switch (resolved.kind) {
    case "component":
      return { ...resolved, node: formattedNode, children };
    case "substituted":
      return { ...resolved, node: formattedNode, children };
    case "fallback":
      return { ...resolved, node: formattedNode, children };
  }
}

/** Board-layer display copy with ISO table cells formatted for the owner's locale. */
export function formatBoardSurfaceDisplay(
  resolved: ResolvedSurface,
  options?: BoardDisplayFormatOptions,
): ResolvedSurface {
  const root = formatResolvedNodeDisplay(resolved.root, options);
  if (root === resolved.root) return resolved;
  return { ...resolved, root };
}
