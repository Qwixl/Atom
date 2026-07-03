import type { Composition, CompositionNode, JsonObject, JsonValue } from "@qwixl/shell-core";
import { mapA2uiComponentName } from "./catalog-map.js";
import type { A2uiComponentRecord, A2uiEnvelope, A2uiSurfaceState } from "./types.js";

const STRUCTURAL_KEYS = new Set([
  "id",
  "component",
  "children",
  "child",
  "action",
  "checks",
  "weight",
]);

/** CUSTOM event name for A2UI envelopes on AG-UI transport. */
export const A2UI_AGUI_EVENT = "a2ui.message";

export function parseA2uiEnvelope(raw: unknown): A2uiEnvelope | null {
  if (typeof raw !== "object" || raw === null) return null;
  const envelope = raw as A2uiEnvelope;
  if (
    envelope.createSurface ||
    envelope.updateComponents ||
    envelope.updateDataModel ||
    envelope.deleteSurface
  ) {
    return envelope;
  }
  return null;
}

function getByPointer(model: JsonObject, pointer: string): JsonValue | undefined {
  if (!pointer || pointer === "/") return model;
  const parts = pointer.split("/").filter(Boolean);
  let current: JsonValue = model;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    const next: JsonValue | undefined = (current as JsonObject)[part];
    if (next === undefined) return undefined;
    current = next;
  }
  return current;
}

function setByPointer(model: JsonObject, pointer: string | undefined, value: JsonValue | undefined): void {
  const path = pointer && pointer !== "/" ? pointer : "/";
  if (path === "/") {
    if (value !== undefined && typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const key of Object.keys(model)) delete model[key];
      Object.assign(model, value as JsonObject);
    }
    return;
  }
  const parts = path.split("/").filter(Boolean);
  let current: JsonObject = model;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = current[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      const created: JsonObject = {};
      current[key] = created;
      current = created;
    } else {
      current = next as JsonObject;
    }
  }
  const leaf = parts[parts.length - 1]!;
  if (value === undefined) delete current[leaf];
  else current[leaf] = value;
}

export function resolveDynamic(value: unknown, dataModel: JsonObject): JsonValue | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object" || Array.isArray(value)) return value as JsonValue;
  const obj = value as Record<string, unknown>;
  if (typeof obj.path === "string") return getByPointer(dataModel, obj.path);
  if ("literal" in obj) return obj.literal as JsonValue;
  return value as JsonValue;
}

function childIds(record: A2uiComponentRecord): string[] {
  const child = record.child;
  if (typeof child === "string") return [child];
  const children = record.children;
  if (Array.isArray(children)) {
    return children.filter((id): id is string => typeof id === "string");
  }
  return [];
}

function extractProps(record: A2uiComponentRecord, dataModel: JsonObject): JsonObject {
  const props: JsonObject = {};
  for (const [key, raw] of Object.entries(record)) {
    if (STRUCTURAL_KEYS.has(key)) continue;
    const resolved = resolveDynamic(raw, dataModel);
    if (resolved !== undefined) props[key] = resolved;
  }
  return props;
}

function semanticRoleFor(a2uiName: string, props: JsonObject): string | undefined {
  switch (a2uiName) {
    case "Text":
    case "Icon":
    case "Divider":
      return "text/body";
    case "Button":
      return "input/action";
    case "TextField":
      return "input/text";
    case "Checkbox":
      return "input/choice";
    case "Image":
      return "media/image";
    case "Row":
      return "container/stack";
    case "Column":
      return "container/stack";
    case "Card":
      return "container/card";
    default:
      return undefined;
  }
}

function eventsFor(a2uiName: string): string[] | undefined {
  if (a2uiName === "Button") return ["activated"];
  if (a2uiName === "Checkbox") return ["selected"];
  return undefined;
}

function normalizeProps(a2uiName: string, props: JsonObject): JsonObject {
  if (a2uiName === "Text" || a2uiName === "Icon") {
    const text = props.text ?? props.name;
    if (typeof text === "string") return { text };
  }
  if (a2uiName === "Divider") return { text: "—" };
  if (a2uiName === "Button") {
    const label = props.label ?? props.text;
    return typeof label === "string" ? { label } : props;
  }
  if (a2uiName === "Row") return { ...props, direction: "horizontal" };
  if (a2uiName === "Column") return { ...props, direction: "vertical" };
  return props;
}

function buildNode(
  id: string,
  state: A2uiSurfaceState,
  visiting: Set<string>,
): CompositionNode | null {
  if (visiting.has(id)) return null;
  const record = state.components.get(id);
  if (!record) return null;

  visiting.add(id);
  const a2uiName = record.component;
  const props = normalizeProps(a2uiName, extractProps(record, state.dataModel));
  const children = childIds(record)
    .map((childId) => buildNode(childId, state, visiting))
    .filter((node): node is CompositionNode => node !== null);
  visiting.delete(id);

  return {
    id,
    component: mapA2uiComponentName(a2uiName),
    semanticRole: semanticRoleFor(a2uiName, props),
    props: Object.keys(props).length > 0 ? props : undefined,
    children: children.length > 0 ? children : undefined,
    events: eventsFor(a2uiName),
  };
}

/** Accumulates A2UI stream messages and materializes Atom compositions. */
export class A2uiSurfaceAssembler {
  private surfaces = new Map<string, A2uiSurfaceState>();

  apply(envelope: A2uiEnvelope): void {
    if (envelope.createSurface) {
      const { surfaceId, catalogId, intent } = envelope.createSurface;
      this.surfaces.set(surfaceId, {
        surfaceId,
        catalogId,
        intent,
        components: new Map(),
        dataModel: {},
      });
    }

    if (envelope.updateComponents) {
      const state = this.ensureSurface(envelope.updateComponents.surfaceId);
      for (const component of envelope.updateComponents.components) {
        if (typeof component.id === "string" && typeof component.component === "string") {
          state.components.set(component.id, component as A2uiComponentRecord);
        }
      }
    }

    if (envelope.updateDataModel) {
      const state = this.ensureSurface(envelope.updateDataModel.surfaceId);
      setByPointer(state.dataModel, envelope.updateDataModel.path, envelope.updateDataModel.value);
    }

    if (envelope.deleteSurface) {
      this.surfaces.delete(envelope.deleteSurface.surfaceId);
    }
  }

  applyRaw(raw: unknown): Composition | null {
    const envelope = parseA2uiEnvelope(raw);
    if (!envelope) return null;
    this.apply(envelope);
    const surfaceId =
      envelope.updateComponents?.surfaceId ??
      envelope.createSurface?.surfaceId ??
      envelope.updateDataModel?.surfaceId;
    return surfaceId ? this.toComposition(surfaceId) : null;
  }

  toComposition(surfaceId: string): Composition | null {
    const state = this.surfaces.get(surfaceId);
    if (!state || !state.components.has("root")) return null;
    const root = buildNode("root", state, new Set());
    if (!root) return null;
    return {
      version: 1,
      surfaceId,
      intent: state.intent,
      root,
    };
  }

  clear(): void {
    this.surfaces.clear();
  }

  private ensureSurface(surfaceId: string): A2uiSurfaceState {
    let state = this.surfaces.get(surfaceId);
    if (!state) {
      state = { surfaceId, components: new Map(), dataModel: {} };
      this.surfaces.set(surfaceId, state);
    }
    return state;
  }
}
