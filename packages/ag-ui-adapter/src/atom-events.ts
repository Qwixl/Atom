import { EventType, type CustomEvent } from "@ag-ui/client";
import {
  A2UI_AGUI_EVENT,
  A2uiSurfaceAssembler,
  parseA2uiEnvelope,
} from "@atom/a2ui-adapter";
import {
  parseCompositionValue,
  parseConsequentialPayload,
  parseDataRequestPayload,
  validateComposition,
  type AgentOutput,
  type Composition,
  type ConsequentialAction,
  type DataRequest,
} from "@atom/shell-core";

const a2uiAssembler = new A2uiSurfaceAssembler();

/** Reset A2UI surface state between agent runs. */
export function resetA2uiAssembler(): void {
  a2uiAssembler.clear();
}

export { A2UI_AGUI_EVENT };
/**
 * Atom extensions to AG-UI CUSTOM events. Agents emit these; the adapter maps
 * them to shell-core AgentOutput. Document for backend authors alongside
 * standard TEXT_MESSAGE_* lifecycle events.
 */
export const ATOM_AGUI_EVENTS = {
  COMPOSITION: "atom.composition",
  CONSEQUENTIAL_ACTION: "atom.consequential-action",
  DATA_REQUEST: "atom.data-request",
} as const;

export type AtomAgUiEventName = (typeof ATOM_AGUI_EVENTS)[keyof typeof ATOM_AGUI_EVENTS];

/** Build a CUSTOM event for an Atom composition surface. */
export function atomCompositionEvent(composition: Composition): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: ATOM_AGUI_EVENTS.COMPOSITION,
    value: composition,
  };
}

/** Build a CUSTOM event for shell-owned consequential chrome. */
export function atomConsequentialActionEvent(
  surfaceId: string,
  action: ConsequentialAction,
): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: ATOM_AGUI_EVENTS.CONSEQUENTIAL_ACTION,
    value: { surfaceId, action },
  };
}

/** Build a CUSTOM event for guarded owner-data disclosure. */
export function atomDataRequestEvent(request: DataRequest): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: ATOM_AGUI_EVENTS.DATA_REQUEST,
    value: request,
  };
}

function wireResultToOutput(result: ReturnType<typeof parseCompositionValue>): AgentOutput | null {
  if (result.kind === "output") return result.output;
  return { type: "text", text: result.text };
}

/** Map an incoming AG-UI CUSTOM event to AgentOutput, or null if not Atom-specific. */
export function mapCustomEventToOutput(event: CustomEvent): AgentOutput | null {
  if (event.name === A2UI_AGUI_EVENT) {
    const envelope = parseA2uiEnvelope(event.value);
    if (!envelope) return null;
    a2uiAssembler.apply(envelope);
    const surfaceId =
      envelope.updateComponents?.surfaceId ??
      envelope.createSurface?.surfaceId ??
      envelope.updateDataModel?.surfaceId;
    if (!surfaceId) return null;
    const composition = a2uiAssembler.toComposition(surfaceId);
    if (!composition) return null;
    const result = validateComposition(composition);
    if (!result.ok) {
      return {
        type: "text",
        text: `(The agent produced an invalid A2UI surface, discarded by the shell: ${result.errors.join("; ")})`,
      };
    }
    return { type: "composition", composition: result.value };
  }

  switch (event.name) {
    case ATOM_AGUI_EVENTS.COMPOSITION:
      return wireResultToOutput(parseCompositionValue(event.value));
    case ATOM_AGUI_EVENTS.CONSEQUENTIAL_ACTION:
      return wireResultToOutput(parseConsequentialPayload(event.value));
    case ATOM_AGUI_EVENTS.DATA_REQUEST:
      return wireResultToOutput(parseDataRequestPayload(event.value));
    default:
      return null;
  }
}
