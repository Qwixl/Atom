/**
 * Presentation-board binding refresh on the brain tick (PS-05 / D123).
 *
 * Structural no-model-call guarantee: this module takes an injected executor and
 * must not import any LLM or brain-turn code.
 */

import type { Composition, CompositionNode, JsonObject, JsonValue } from "@qwixl/shell-core";
import type { SurfaceBinding, SurfaceRefreshTrigger } from "@qwixl/shell-core";
import type { PersistedSurface } from "@qwixl/owner-store";
import { isIntervalOrDailyDue } from "./refreshSchedule.js";

const FAILURE_THRESHOLD = 3;

export type BoardBindingExecutor = (
  call: {
    connectorId: string;
    operation: string;
    input?: Record<string, unknown>;
  },
) => Promise<unknown>;

export interface SurfaceRefreshDueContext {
  /** When true, `on-open` surfaces not refreshed since open are due. */
  sessionOpened?: boolean;
  sessionOpenedAtMs?: number;
  changedConnectors?: ReadonlySet<string>;
}

export interface BoardDegradeRequest {
  surfaceId: string;
  message: string;
}

export interface RefreshDueSurfacesInput {
  surfaces: readonly PersistedSurface[];
  executor: BoardBindingExecutor;
  entitledConnectors: readonly string[];
  now: number;
  dueContext?: SurfaceRefreshDueContext;
}

export interface RefreshDueSurfacesResult {
  surfaces: PersistedSurface[];
  expiredSurfaceIds: string[];
  refreshedSurfaceIds: string[];
  degradeRequests: BoardDegradeRequest[];
  /** True when surfaces metadata changed and should be persisted. */
  stateChanged: boolean;
}

function bindingKey(binding: SurfaceBinding): string {
  return `${binding.nodeId}:${binding.prop}`;
}

function isBindingAtFailureThreshold(
  failureCounts: Record<string, number> | undefined,
  key: string,
): boolean {
  return (failureCounts?.[key] ?? 0) >= FAILURE_THRESHOLD;
}

function isParticipatingBinding(
  surface: PersistedSurface,
  binding: SurfaceBinding,
): boolean {
  return !isBindingAtFailureThreshold(surface.failureCounts, bindingKey(binding));
}

function hasParticipatingBindings(surface: PersistedSurface): boolean {
  return surface.bindings.some((binding) => isParticipatingBinding(surface, binding));
}

/**
 * Oldest attempt time across participating bindings only (degraded bindings excluded).
 * Returns null when any participating binding has never been attempted.
 */
function surfaceLastAttemptMs(surface: PersistedSurface): number | null {
  let min = Infinity;
  let participating = 0;
  for (const binding of surface.bindings) {
    if (!isParticipatingBinding(surface, binding)) continue;
    participating += 1;
    const at = surface.lastAttemptedAt?.[bindingKey(binding)];
    if (at === undefined) return null;
    if (at < min) min = at;
  }
  if (participating === 0) return null;
  return min === Infinity ? null : min;
}

export function isSurfaceRefreshDue(
  trigger: SurfaceRefreshTrigger,
  lastAttemptedMs: number | null,
  now: Date,
  context: SurfaceRefreshDueContext = {},
): boolean {
  switch (trigger.type) {
    case "interval":
    case "daily-time":
      return isIntervalOrDailyDue(trigger, lastAttemptedMs, now);
    case "on-open":
      if (!context.sessionOpened || context.sessionOpenedAtMs === undefined) return false;
      return lastAttemptedMs === null || lastAttemptedMs < context.sessionOpenedAtMs;
    case "connector-change":
      return context.changedConnectors?.has(trigger.connector) ?? false;
    default:
      return false;
  }
}

export function listDueSurfaces(
  surfaces: readonly PersistedSurface[],
  now: number,
  context: SurfaceRefreshDueContext = {},
): PersistedSurface[] {
  const when = new Date(now);
  return surfaces.filter((surface) => {
    const trigger = surface.refresh?.trigger;
    if (!trigger) return false;
    if (!hasParticipatingBindings(surface)) return false;
    return isSurfaceRefreshDue(trigger, surfaceLastAttemptMs(surface), when, context);
  });
}

function isSurfaceExpired(surface: PersistedSurface, now: number): boolean {
  const expiresAfterSeconds = surface.refresh?.expiresAfterSeconds;
  if (!expiresAfterSeconds) return false;
  return now - surface.createdAt >= expiresAfterSeconds * 1000;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function evaluateJsonPointer(doc: unknown, pointer: string): unknown {
  if (pointer === "") return doc;
  if (!pointer.startsWith("/")) {
    throw new Error("JSON Pointer must start with '/'");
  }
  const segments =
    pointer === "/" ? [""] : pointer.slice(1).split("/").map(decodeJsonPointerSegment);
  let current: unknown = doc;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = segment === "-" ? current.length - 1 : Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isCalendarEventLike(
  value: unknown,
): value is { summary: string; start: string; end?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.summary === "string" && typeof record.start === "string";
}

function formatCalendarEventWhen(start: string, end?: string): string {
  try {
    const startDate = new Date(start);
    const startText = startDate.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    if (!end) return startText;
    const endText = new Date(end).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${startText} – ${endText}`;
  } catch {
    return end ? `${start} – ${end}` : start;
  }
}

function coerceBindingFormat(value: unknown, format?: SurfaceBinding["format"]): JsonValue {
  if (!format || format === "text") {
    if (value === null || value === undefined) return "";
    return String(value);
  }
  switch (format) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    case "date": {
      if (typeof value === "string") return value;
      if (typeof value === "number" && Number.isFinite(value)) {
        return new Date(value).toISOString();
      }
      return String(value ?? "");
    }
    case "list":
      return (Array.isArray(value) ? value : [value]) as JsonValue;
    case "table": {
      if (!Array.isArray(value)) return [];
      if (value.length > 0 && isCalendarEventLike(value[0])) {
        return value.map((item) => {
          const event = item as { summary: string; start: string; end?: string };
          return [formatCalendarEventWhen(event.start, event.end), event.summary];
        }) as JsonValue;
      }
      return value as JsonValue;
    }
    default:
      return value as JsonValue;
  }
}

function cloneComposition(composition: Composition): Composition {
  return JSON.parse(JSON.stringify(composition)) as Composition;
}

function findNode(root: CompositionNode, nodeId: string): CompositionNode | null {
  if (root.id === nodeId) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

function safeSetNodeProp(node: CompositionNode, propPath: string, value: JsonValue): void {
  const segments = propPath.split(".");
  if (segments.some((segment) => segment === "__proto__" || segment === "constructor")) {
    throw new Error("Forbidden property path");
  }
  let target: JsonObject = node.props ?? (node.props = {});
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const nested = target[segment];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      target[segment] = {};
    }
    target = target[segment] as JsonObject;
  }
  const leaf = segments[segments.length - 1]!;
  target[leaf] = value;
}

function clearBindingFailure(
  failureCounts: Record<string, number>,
  key: string,
): Record<string, number> | undefined {
  if (!(key in failureCounts)) return Object.keys(failureCounts).length > 0 ? failureCounts : undefined;
  const next = { ...failureCounts };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

function recordBindingFailure(
  failureCounts: Record<string, number> | undefined,
  key: string,
): { failureCounts?: Record<string, number>; crossedThreshold: boolean } {
  const base = failureCounts ?? {};
  const prev = base[key] ?? 0;
  const nextCount = Math.min(prev + 1, FAILURE_THRESHOLD);
  const crossedThreshold = prev < FAILURE_THRESHOLD && nextCount >= FAILURE_THRESHOLD;
  return {
    failureCounts: { ...base, [key]: nextCount },
    crossedThreshold,
  };
}

async function refreshBinding(
  surface: PersistedSurface,
  binding: SurfaceBinding,
  composition: Composition,
  executor: BoardBindingExecutor,
  entitled: ReadonlySet<string>,
  now: number,
): Promise<{
  composition: Composition;
  lastRefreshedAt: Record<string, number>;
  lastAttemptedAt: Record<string, number>;
  failureCounts?: Record<string, number>;
  lastError?: { at: number; message: string };
  degradeRequest?: BoardDegradeRequest;
  attempted: boolean;
}> {
  const key = bindingKey(binding);
  let lastRefreshedAt = { ...surface.lastRefreshedAt };
  let lastAttemptedAt = { ...(surface.lastAttemptedAt ?? {}) };
  let failureCounts = surface.failureCounts ? { ...surface.failureCounts } : undefined;
  let lastError = surface.lastError;

  lastAttemptedAt = { ...lastAttemptedAt, [key]: now };

  const fail = (message: string): {
    composition: Composition;
    lastRefreshedAt: Record<string, number>;
    lastAttemptedAt: Record<string, number>;
    failureCounts?: Record<string, number>;
    lastError?: { at: number; message: string };
    degradeRequest?: BoardDegradeRequest;
    attempted: boolean;
  } => {
    const recorded = recordBindingFailure(failureCounts, key);
    failureCounts = recorded.failureCounts;
    lastError = { at: now, message };
    return {
      composition,
      lastRefreshedAt,
      lastAttemptedAt,
      failureCounts,
      lastError,
      degradeRequest: recorded.crossedThreshold
        ? {
            surfaceId: surface.surfaceId,
            message: `Board tile "${surface.surfaceId}" binding ${key} failed ${FAILURE_THRESHOLD} times: ${message}. Re-compose or release the surface.`,
          }
        : undefined,
      attempted: true,
    };
  };

  if (!entitled.has(binding.source.connector)) {
    return fail(`Connector "${binding.source.connector}" is not entitled`);
  }

  try {
    const raw = await executor({
      connectorId: binding.source.connector,
      operation: binding.source.tool,
      input: binding.source.args,
    });
    const selected =
      binding.select !== undefined ? evaluateJsonPointer(raw, binding.select) : raw;
    if (selected === undefined) {
      return fail(
        binding.select
          ? `Select pointer "${binding.select}" did not resolve`
          : "Connector returned no value",
      );
    }
    const node = findNode(composition.root, binding.nodeId);
    if (!node) {
      return fail(`Node "${binding.nodeId}" not found in composition`);
    }
    safeSetNodeProp(node, binding.prop, coerceBindingFormat(selected, binding.format));
    lastRefreshedAt = { ...lastRefreshedAt, [key]: now };
    failureCounts = clearBindingFailure(failureCounts ?? {}, key);
    return {
      composition,
      lastRefreshedAt,
      lastAttemptedAt,
      failureCounts,
      lastError: undefined,
      attempted: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}

async function refreshSurface(
  surface: PersistedSurface,
  executor: BoardBindingExecutor,
  entitled: ReadonlySet<string>,
  now: number,
): Promise<{
  surface: PersistedSurface;
  refreshed: boolean;
  degradeRequests: BoardDegradeRequest[];
  changed: boolean;
}> {
  let composition = cloneComposition(surface.composition);
  let lastRefreshedAt = { ...surface.lastRefreshedAt };
  let lastAttemptedAt = { ...(surface.lastAttemptedAt ?? {}) };
  let failureCounts = surface.failureCounts ? { ...surface.failureCounts } : undefined;
  let lastError = surface.lastError;
  const degradeRequests: BoardDegradeRequest[] = [];
  let refreshed = false;
  let hadFailure = false;
  let changed = false;

  for (const binding of surface.bindings) {
    const key = bindingKey(binding);
    if (isBindingAtFailureThreshold(failureCounts, key)) {
      continue;
    }

    const result = await refreshBinding(
      { ...surface, lastRefreshedAt, lastAttemptedAt, failureCounts, lastError },
      binding,
      composition,
      executor,
      entitled,
      now,
    );
    if (!result.attempted) continue;
    changed = true;
    composition = result.composition;
    lastRefreshedAt = result.lastRefreshedAt;
    lastAttemptedAt = result.lastAttemptedAt;
    failureCounts = result.failureCounts;
    if (result.lastError) {
      hadFailure = true;
      lastError = result.lastError;
    }
    if (result.degradeRequest) degradeRequests.push(result.degradeRequest);
    if (result.lastRefreshedAt[key] === now) refreshed = true;
  }

  if (!hadFailure) lastError = undefined;

  if (!changed) {
    return {
      surface,
      refreshed: false,
      degradeRequests: [],
      changed: false,
    };
  }

  const nextSurface: PersistedSurface = {
    ...surface,
    composition,
    lastRefreshedAt,
    lastAttemptedAt: Object.keys(lastAttemptedAt).length > 0 ? lastAttemptedAt : undefined,
    failureCounts,
    lastError,
    updatedAt: now,
  };

  return {
    surface: nextSurface,
    refreshed,
    degradeRequests,
    changed: true,
  };
}

function persistedSurfaceEqual(a: PersistedSurface, b: PersistedSurface): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Refresh due board surfaces: resolve bindings via the injected executor only.
 * Expired surfaces are removed from the returned list; `dismissed` is not touched
 * here — expiry is not owner dismissal.
 */
export async function refreshDueSurfaces(
  input: RefreshDueSurfacesInput,
): Promise<RefreshDueSurfacesResult> {
  const entitled = new Set(input.entitledConnectors);
  const due = listDueSurfaces(input.surfaces, input.now, input.dueContext);
  const dueIds = new Set(due.map((surface) => surface.surfaceId));

  const expiredSurfaceIds: string[] = [];
  const refreshedSurfaceIds: string[] = [];
  const degradeRequests: BoardDegradeRequest[] = [];
  const nextSurfaces: PersistedSurface[] = [];
  let stateChanged = false;

  for (const surface of input.surfaces) {
    if (isSurfaceExpired(surface, input.now)) {
      // Expiry releases the tile; it must not write to `dismissed` — dismissal
      // means the owner rejected the surface and the agent must not re-pin it.
      expiredSurfaceIds.push(surface.surfaceId);
      stateChanged = true;
      continue;
    }

    if (!dueIds.has(surface.surfaceId)) {
      nextSurfaces.push(surface);
      continue;
    }

    const result = await refreshSurface(surface, input.executor, entitled, input.now);
    nextSurfaces.push(result.surface);
    degradeRequests.push(...result.degradeRequests);
    if (result.refreshed) refreshedSurfaceIds.push(surface.surfaceId);
    if (result.changed || !persistedSurfaceEqual(surface, result.surface)) {
      stateChanged = true;
    }
  }

  return {
    surfaces: nextSurfaces,
    expiredSurfaceIds,
    refreshedSurfaceIds,
    degradeRequests,
    stateChanged,
  };
}
