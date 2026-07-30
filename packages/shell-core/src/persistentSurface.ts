import type { Composition, CompositionNode } from "./types.js";
import { validateComposition, validateConsequentialAction } from "./validate.js";
import type { ValidationResult } from "./validate.js";

export interface SurfaceBinding {
  nodeId: string;
  prop: string;
  source: { connector: string; tool: string; args?: Record<string, unknown> };
  select?: string;
  format?: "text" | "number" | "date" | "list" | "table";
}

export type SurfaceRefreshTrigger =
  | { type: "interval"; everyMinutes: number }
  | { type: "daily-time"; time: string }
  | { type: "on-open" }
  | { type: "connector-change"; connector: string };

export interface SurfaceRefresh {
  trigger: SurfaceRefreshTrigger;
  staleAfterSeconds: number;
  expiresAfterSeconds?: number;
}

export interface SurfacePlacement {
  screen?: number;
  order?: number;
  size?: "s" | "m" | "l";
  pinned?: boolean;
}

export interface SurfacePin {
  composition: Composition;
  bindings?: SurfaceBinding[];
  refresh?: SurfaceRefresh;
  placement?: SurfacePlacement;
}

export interface SurfaceRelease {
  surfaceId: string;
  reason?: string;
}

export interface SurfaceArrange {
  placements: Array<{ surfaceId: string } & SurfacePlacement>;
}

export const SURFACE_REFRESH_MIN_MINUTES = 15;

const BOARD_FORBIDDEN_COMPONENTS = new Set(["core/form", "core/text-field"]);
const SURFACE_FORMATS = new Set(["text", "number", "date", "list", "table"]);
const SURFACE_SIZES = new Set(["s", "m", "l"]);

export type ValidateSurfacePinOptions = {
  entitledConnectors?: string[];
  /** Wire parsing only — skips entitlement (rule 4); shell re-validates at apply. */
  shapeOnly?: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectNodeIds(node: CompositionNode, ids: Set<string>): void {
  ids.add(node.id);
  for (const child of node.children ?? []) {
    collectNodeIds(child, ids);
  }
}

function isPlainIdentifierPropPath(prop: string): boolean {
  if (prop.length === 0) return false;
  for (const segment of prop.split(".")) {
    if (segment.length === 0) return false;
    if (segment === "__proto__" || segment === "constructor") return false;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) return false;
  }
  return true;
}

function containsConsequentialActionShape(
  value: unknown,
  seen = new Set<unknown>(),
): boolean {
  if (!isPlainObject(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (validateConsequentialAction(value).ok) return true;
  for (const nested of Object.values(value)) {
    if (containsConsequentialActionShape(nested, seen)) return true;
  }
  return false;
}

function validateReadOnlyComposition(root: CompositionNode, path: string, errors: string[]): void {
  if (BOARD_FORBIDDEN_COMPONENTS.has(root.component)) {
    errors.push(
      `${path}.component: board tiles are read-only (${root.component} is not allowed)`,
    );
  }
  if (containsConsequentialActionShape(root.props)) {
    errors.push(`${path}: board tiles are read-only (consequential action shape is not allowed)`);
  }
  root.children?.forEach((child, index) =>
    validateReadOnlyComposition(child, `${path}.children[${index}]`, errors),
  );
}

function validatePlacementFields(
  placement: unknown,
  path: string,
  errors: string[],
): SurfacePlacement | undefined {
  if (placement === undefined) return undefined;
  if (!isPlainObject(placement)) {
    errors.push(`${path}: must be an object`);
    return undefined;
  }
  const result: SurfacePlacement = {};
  if (placement.screen !== undefined) {
    if (typeof placement.screen !== "number" || !Number.isInteger(placement.screen) || placement.screen < 0) {
      errors.push(`${path}.screen: must be a non-negative integer`);
    } else {
      result.screen = placement.screen;
    }
  }
  if (placement.order !== undefined) {
    if (typeof placement.order !== "number" || !Number.isInteger(placement.order) || placement.order < 0) {
      errors.push(`${path}.order: must be a non-negative integer`);
    } else {
      result.order = placement.order;
    }
  }
  if (placement.size !== undefined) {
    if (typeof placement.size !== "string" || !SURFACE_SIZES.has(placement.size)) {
      errors.push(`${path}.size: must be one of s, m, l`);
    } else {
      result.size = placement.size as SurfacePlacement["size"];
    }
  }
  if (placement.pinned !== undefined) {
    if (typeof placement.pinned !== "boolean") {
      errors.push(`${path}.pinned: must be a boolean`);
    } else {
      result.pinned = placement.pinned;
    }
  }
  return result;
}

function validateRefreshTrigger(
  trigger: unknown,
  path: string,
  errors: string[],
): SurfaceRefreshTrigger | undefined {
  if (!isPlainObject(trigger) || typeof trigger.type !== "string") {
    errors.push(`${path}.trigger: required object with type`);
    return undefined;
  }
  switch (trigger.type) {
    case "interval": {
      if (typeof trigger.everyMinutes !== "number" || !Number.isFinite(trigger.everyMinutes)) {
        errors.push(`${path}.trigger.everyMinutes: must be a finite number`);
        return undefined;
      }
      return {
        type: "interval",
        everyMinutes: Math.max(trigger.everyMinutes, SURFACE_REFRESH_MIN_MINUTES),
      };
    }
    case "daily-time": {
      if (typeof trigger.time !== "string" || trigger.time.length === 0) {
        errors.push(`${path}.trigger.time: required non-empty string`);
        return undefined;
      }
      return { type: "daily-time", time: trigger.time };
    }
    case "on-open":
      return { type: "on-open" };
    case "connector-change": {
      if (typeof trigger.connector !== "string" || trigger.connector.length === 0) {
        errors.push(`${path}.trigger.connector: required non-empty string`);
        return undefined;
      }
      return { type: "connector-change", connector: trigger.connector };
    }
    default:
      errors.push(`${path}.trigger.type: unknown trigger type "${trigger.type}"`);
      return undefined;
  }
}

function validateRefresh(refresh: unknown, path: string, errors: string[]): SurfaceRefresh | undefined {
  if (refresh === undefined) return undefined;
  if (!isPlainObject(refresh)) {
    errors.push(`${path}: must be an object`);
    return undefined;
  }
  const refreshErrors: string[] = [];
  const trigger = validateRefreshTrigger(refresh.trigger, path, refreshErrors);
  if (
    typeof refresh.staleAfterSeconds !== "number" ||
    !Number.isFinite(refresh.staleAfterSeconds) ||
    refresh.staleAfterSeconds <= 0
  ) {
    refreshErrors.push(`${path}.staleAfterSeconds: must be a positive finite number`);
  }
  if (refresh.expiresAfterSeconds !== undefined) {
    if (
      typeof refresh.expiresAfterSeconds !== "number" ||
      !Number.isFinite(refresh.expiresAfterSeconds) ||
      refresh.expiresAfterSeconds <= 0
    ) {
      refreshErrors.push(`${path}.expiresAfterSeconds: must be a positive finite number`);
    }
  }
  if (refreshErrors.length > 0) {
    errors.push(...refreshErrors);
    return undefined;
  }
  const result: SurfaceRefresh = {
    trigger: trigger!,
    staleAfterSeconds: refresh.staleAfterSeconds as number,
  };
  if (refresh.expiresAfterSeconds !== undefined) {
    result.expiresAfterSeconds = refresh.expiresAfterSeconds as number;
  }
  return result;
}

function validateBinding(
  binding: unknown,
  index: number,
  nodeIds: Set<string>,
  options: ValidateSurfacePinOptions | undefined,
  errors: string[],
): SurfaceBinding | undefined {
  const path = `bindings[${index}]`;
  const bindingErrors: string[] = [];
  if (!isPlainObject(binding)) {
    errors.push(`${path}: must be an object`);
    return undefined;
  }
  if (typeof binding.nodeId !== "string" || binding.nodeId.length === 0) {
    bindingErrors.push(`${path}.nodeId: required non-empty string`);
  } else if (!nodeIds.has(binding.nodeId)) {
    bindingErrors.push(`${path}.nodeId: does not resolve to a node in the composition`);
  }
  if (typeof binding.prop !== "string" || !isPlainIdentifierPropPath(binding.prop)) {
    bindingErrors.push(`${path}.prop: must be a non-empty dot path of plain identifiers`);
  }
  if (!isPlainObject(binding.source)) {
    bindingErrors.push(`${path}.source: required object`);
  } else {
    if (typeof binding.source.connector !== "string" || binding.source.connector.length === 0) {
      bindingErrors.push(`${path}.source.connector: required non-empty string`);
    } else if (!options?.shapeOnly) {
      const entitled = options?.entitledConnectors;
      if (!entitled) {
        bindingErrors.push(`${path}.source.connector: no entitled connectors available`);
      } else if (!entitled.includes(binding.source.connector)) {
        bindingErrors.push(
          `${path}.source.connector: connector "${binding.source.connector}" is not entitled`,
        );
      }
    }
    if (typeof binding.source.tool !== "string" || binding.source.tool.length === 0) {
      bindingErrors.push(`${path}.source.tool: required non-empty string`);
    }
    if (
      binding.source.args !== undefined &&
      (!isPlainObject(binding.source.args) || Array.isArray(binding.source.args))
    ) {
      bindingErrors.push(`${path}.source.args: must be an object`);
    }
  }
  if (binding.select !== undefined && typeof binding.select !== "string") {
    bindingErrors.push(`${path}.select: must be a string`);
  }
  if (binding.format !== undefined) {
    if (typeof binding.format !== "string" || !SURFACE_FORMATS.has(binding.format)) {
      bindingErrors.push(`${path}.format: must be one of text, number, date, list, table`);
    }
  }
  if (bindingErrors.length > 0) {
    errors.push(...bindingErrors);
    return undefined;
  }
  const result: SurfaceBinding = {
    nodeId: binding.nodeId as string,
    prop: binding.prop as string,
    source: {
      connector: (binding.source as { connector: string; tool: string }).connector,
      tool: (binding.source as { connector: string; tool: string }).tool,
    },
  };
  const args = (binding.source as { args?: Record<string, unknown> }).args;
  if (args !== undefined) result.source.args = args;
  if (binding.select !== undefined) result.select = binding.select as string;
  if (binding.format !== undefined) result.format = binding.format as SurfaceBinding["format"];
  return result;
}

export function validateSurfacePin(
  value: unknown,
  options?: ValidateSurfacePinOptions,
): ValidationResult<SurfacePin> {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["surface pin must be an object"] };
  }

  const compositionResult = validateComposition(value.composition);
  if (!compositionResult.ok) {
    for (const error of compositionResult.errors) {
      errors.push(`composition: ${error}`);
    }
  } else {
    validateReadOnlyComposition(compositionResult.value.root, "composition.root", errors);
  }

  const nodeIds = new Set<string>();
  if (compositionResult.ok) {
    collectNodeIds(compositionResult.value.root, nodeIds);
  }

  const bindings: SurfaceBinding[] = [];
  if (value.bindings !== undefined) {
    if (!Array.isArray(value.bindings)) {
      errors.push("bindings: must be an array");
    } else {
      value.bindings.forEach((binding, index) => {
        const validated = validateBinding(binding, index, nodeIds, options, errors);
        if (validated) bindings.push(validated);
      });
    }
  }

  const refresh = validateRefresh(value.refresh, "refresh", errors);
  const placement = validatePlacementFields(value.placement, "placement", errors);

  if (errors.length > 0) return { ok: false, errors };

  const pin: SurfacePin = { composition: compositionResult.ok ? compositionResult.value : (value.composition as Composition) };
  if (bindings.length > 0) pin.bindings = bindings;
  if (refresh) pin.refresh = refresh;
  if (placement) pin.placement = placement;
  return { ok: true, value: pin };
}

export function validateSurfaceRelease(value: unknown): ValidationResult<SurfaceRelease> {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["surface release must be an object"] };
  }
  if (typeof value.surfaceId !== "string" || value.surfaceId.length === 0) {
    errors.push("surfaceId: required non-empty string");
  }
  if (value.reason !== undefined && typeof value.reason !== "string") {
    errors.push("reason: must be a string");
  }
  if (errors.length > 0) return { ok: false, errors };
  const release: SurfaceRelease = { surfaceId: value.surfaceId as string };
  if (value.reason !== undefined) release.reason = value.reason as string;
  return { ok: true, value: release };
}

export function validateSurfaceArrange(value: unknown): ValidationResult<SurfaceArrange> {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["surface arrange must be an object"] };
  }
  if (!Array.isArray(value.placements) || value.placements.length === 0) {
    errors.push("placements: required non-empty array");
    return { ok: false, errors };
  }

  const placements: SurfaceArrange["placements"] = [];
  const seenSurfaceIds = new Set<string>();
  value.placements.forEach((placement, index) => {
    const path = `placements[${index}]`;
    if (!isPlainObject(placement)) {
      errors.push(`${path}: must be an object`);
      return;
    }
    if (typeof placement.surfaceId !== "string" || placement.surfaceId.length === 0) {
      errors.push(`${path}.surfaceId: required non-empty string`);
      return;
    }
    if (seenSurfaceIds.has(placement.surfaceId)) {
      errors.push(`${path}.surfaceId: duplicate surfaceId "${placement.surfaceId}"`);
      return;
    }
    seenSurfaceIds.add(placement.surfaceId);
    const fields = validatePlacementFields(placement, path, errors);
    placements.push({ surfaceId: placement.surfaceId, ...fields });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { placements } };
}
