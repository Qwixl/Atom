export type {
  A2uiEnvelope,
  A2uiCreateSurface,
  A2uiUpdateComponents,
  A2uiUpdateDataModel,
  A2uiDeleteSurface,
  A2uiComponentRecord,
  A2uiSurfaceState,
} from "./types.js";

export { A2UI_BASIC_CATALOG_MAP, mapA2uiComponentName } from "./catalog-map.js";

export {
  A2UI_AGUI_EVENT,
  A2uiSurfaceAssembler,
  parseA2uiEnvelope,
  resolveDynamic,
} from "./assembler.js";

import { A2UI_AGUI_EVENT } from "./assembler.js";
import type { A2uiEnvelope } from "./types.js";

/** Build an AG-UI CUSTOM event value carrying an A2UI envelope. */
export function a2uiMessageEvent(envelope: A2uiEnvelope): {
  name: typeof A2UI_AGUI_EVENT;
  value: A2uiEnvelope;
} {
  return { name: A2UI_AGUI_EVENT, value: envelope };
}
