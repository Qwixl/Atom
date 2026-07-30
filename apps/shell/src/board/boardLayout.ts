import type { PersistedSurface } from "@qwixl/owner-store";
import type { SurfaceBinding, SurfacePlacement } from "@qwixl/shell-core";

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

export function clampScreen(screen: number, maxPersistedScreenIndex: number): number {
  return Math.min(Math.max(0, screen), Math.max(0, maxPersistedScreenIndex));
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
  const persistedMax = maxPersistedScreen(surfaces);
  const tiles: LayoutBoardTile[] = surfaces.map((surface) => {
    const agent = agentPlacements[surface.surfaceId];
    let placement = effectivePlacement(surface, agent);
    if (!surface.ownerOverrides.includes("screen")) {
      placement = { ...placement, screen: clampScreen(placement.screen, persistedMax) };
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
