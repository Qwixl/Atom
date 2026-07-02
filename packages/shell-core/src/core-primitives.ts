import type { Catalog, ComponentSpec } from "./catalog.js";

/**
 * The ~15 core primitives compiled into every shell (v1 sketch). Renderers
 * provide the visual implementation; this is the canonical vocabulary the
 * composing agent is given.
 */
export const CORE_PRIMITIVES: ComponentSpec[] = [
  {
    name: "core/text",
    semanticRole: "text/body",
    agentHint: "Plain paragraph text. Props: { text }.",
  },
  {
    name: "core/heading",
    semanticRole: "text/heading",
    agentHint: "Section heading. Props: { text, level? (1-3) }.",
  },
  {
    name: "core/image",
    semanticRole: "media/image",
    agentHint: "Image. Props: { src, alt, caption? }.",
  },
  {
    name: "core/list",
    semanticRole: "collection/list",
    agentHint: "Bulleted or numbered list. Props: { items: string[], ordered? }.",
  },
  {
    name: "core/table",
    semanticRole: "collection/table",
    agentHint:
      "Tabular data. Props: { columns: string[], rows: JsonValue[][] }. Also the fallback for any unavailable chart.",
  },
  {
    name: "core/card",
    semanticRole: "container/card",
    agentHint:
      "Grouping card with optional title/subtitle. Props: { title?, subtitle? }. Children render inside.",
  },
  {
    name: "core/choice",
    semanticRole: "input/choice",
    events: ["selected"],
    agentHint:
      "Present options for the user to pick one. Props: { options: [{ id, label, description?, detail?, recommended? }] }. Emits 'selected' with { optionId }.",
  },
  {
    name: "core/form",
    semanticRole: "input/form",
    events: ["submitted"],
    agentHint:
      "Field container. Props: { submitLabel? }. Children are core/text-field nodes. Emits 'submitted' with { values }.",
  },
  {
    name: "core/text-field",
    semanticRole: "input/text",
    agentHint: "Single text input inside core/form. Props: { name, label, placeholder?, value? }.",
  },
  {
    name: "core/action",
    semanticRole: "input/action",
    events: ["activated"],
    agentHint:
      "Inconsequential button (navigate, expand, request more options). Emits 'activated'. Actions of consequence must use a consequential-action instead — the shell renders those in its own chrome.",
  },
  {
    name: "core/status",
    semanticRole: "feedback/status",
    agentHint: "Status line. Props: { text, tone? ('info'|'success'|'warn'|'error') }.",
  },
  {
    name: "core/progress",
    semanticRole: "feedback/progress",
    agentHint: "Progress indicator. Props: { label?, value? (0-100, omit for indeterminate) }.",
  },
  {
    name: "core/chart",
    semanticRole: "chart/time-series",
    agentHint:
      "Simple series chart. Props: { series: [{ label, points: [{ x, y }] }], unit? }.",
  },
  {
    name: "core/stack",
    semanticRole: "container/stack",
    agentHint: "Layout container. Props: { direction? ('vertical'|'horizontal'), gap? }.",
  },
  {
    name: "core/disclosure",
    semanticRole: "container/disclosure",
    agentHint: "Collapsed-by-default section. Props: { summary }. Children render when expanded.",
  },
];

export function registerCorePrimitives(catalog: Catalog): void {
  for (const spec of CORE_PRIMITIVES) catalog.registerCore(spec);
}
