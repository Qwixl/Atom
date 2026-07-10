import { EventType, type CustomEvent } from "@ag-ui/client";
import {
  A2UI_AGUI_EVENT,
  A2uiSurfaceAssembler,
  parseA2uiEnvelope,
} from "@qwixl/a2ui-adapter";
import {
  parseCompositionValue,
  parseConsequentialPayload,
  parseDataRequestPayload,
  parseGameMovePayload,
  validateComposition,
  type AgentOutput,
  type Composition,
  type ConsequentialAction,
  type DataRequest,
  type JsonValue,
} from "@qwixl/shell-core";

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
  GAME_MOVE: "atom.game-move",
  CONNECTOR_INVOKE: "atom.connector-invoke",
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

/** Build a CUSTOM event for a shell-arbitrated game move. */
export function atomGameMoveEvent(surfaceId: string, move: JsonValue): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: ATOM_AGUI_EVENTS.GAME_MOVE,
    value: { surfaceId, move },
  };
}

export type AtomConnectorId =
  | "webcal"
  | "rss"
  | "news-search"
  | "page-fetch"
  | "bookmarks"
  | "todoist"
  | "github"
  | "notion"
  | "linear"
  | "trello"
  | "home-assistant"
  | "caldav"
  | "carddav"
  | "bluesky"
  | "mastodon"
  | "weather";

export type AtomConnectorInvokeRequest = {
  callId: string;
  /** Prefer intent-named tool (D081); shell/registry resolves to connectorId+operation. */
  toolName?: string;
  connectorId?: AtomConnectorId;
  operation?: string;
  input?: Record<string, unknown>;
};

/** Ask the shell to invoke an owner connector (read-scoped). Shell responds with [connector-result]. */
export function atomConnectorInvokeEvent(request: AtomConnectorInvokeRequest): CustomEvent {
  return {
    type: EventType.CUSTOM,
    name: ATOM_AGUI_EVENTS.CONNECTOR_INVOKE,
    value: request,
  };
}

const KNOWN_CONNECTOR_IDS = new Set<string>([
  "webcal",
  "rss",
  "news-search",
  "page-fetch",
  "bookmarks",
  "todoist",
  "github",
  "notion",
  "linear",
  "trello",
  "home-assistant",
  "caldav",
  "carddav",
  "bluesky",
  "mastodon",
  "weather",
]);

function readConnectorInvokeRequest(value: unknown): AtomConnectorInvokeRequest | null {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!body || typeof body.callId !== "string") return null;

  const toolName = typeof body.toolName === "string" ? body.toolName.trim() : undefined;
  const connectorId =
    typeof body.connectorId === "string" && KNOWN_CONNECTOR_IDS.has(body.connectorId)
      ? (body.connectorId as AtomConnectorId)
      : undefined;
  const operation = typeof body.operation === "string" ? body.operation : undefined;
  if (!toolName && (!connectorId || !operation)) return null;

  return {
    callId: body.callId,
    toolName: toolName || undefined,
    connectorId,
    operation,
    input:
      body.input && typeof body.input === "object" && !Array.isArray(body.input)
        ? (body.input as Record<string, unknown>)
        : undefined,
  };
}

/** Parse atom.connector-invoke CUSTOM payload. */
export function parseConnectorInvokeRequest(value: unknown): AtomConnectorInvokeRequest | null {
  return readConnectorInvokeRequest(value);
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
    case ATOM_AGUI_EVENTS.GAME_MOVE:
      return wireResultToOutput(parseGameMovePayload(event.value));
    default:
      return null;
  }
}
