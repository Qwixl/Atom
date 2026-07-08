import type { JsonValue } from "@qwixl/shell-core";

export type AtomUiEventInbound = {
  kind: "ui-event";
  surfaceId: string;
  nodeId: string;
  name: string;
  payload: JsonValue | null;
};

export type AtomActionDecisionInbound = {
  kind: "action-decision";
  actionId: string;
  decision: "approved" | "declined";
};

export type AtomDataDisclosureInbound = {
  kind: "data-disclosure";
  requestId: string;
  decision: "approved" | "declined";
  records?: Array<{ category: string; label: string; value: JsonValue }>;
};

export type AtomConnectorResultInbound = {
  kind: "connector-result";
  callId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type AtomInboundMessage =
  | { kind: "user-text"; text: string }
  | AtomUiEventInbound
  | AtomActionDecisionInbound
  | AtomDataDisclosureInbound
  | AtomConnectorResultInbound;

const PREFIXES = {
  UI_EVENT: "[ui-event] ",
  ACTION_DECISION: "[action-decision] ",
  DATA_DISCLOSURE: "[data-disclosure] ",
  CONNECTOR_RESULT: "[connector-result] ",
} as const;

function parseJsonSuffix<T>(content: string, prefix: string): T | null {
  if (!content.startsWith(prefix)) return null;
  try {
    return JSON.parse(content.slice(prefix.length)) as T;
  } catch {
    return null;
  }
}

/** Parse a shell → agent user message (bracket protocol or plain text). */
export function parseAtomInboundMessage(content: string): AtomInboundMessage {
  const ui = parseJsonSuffix<{
    surfaceId?: string;
    nodeId?: string;
    name?: string;
    payload?: JsonValue | null;
  }>(content, PREFIXES.UI_EVENT);
  if (ui && typeof ui.surfaceId === "string" && typeof ui.nodeId === "string" && typeof ui.name === "string") {
    return {
      kind: "ui-event",
      surfaceId: ui.surfaceId,
      nodeId: ui.nodeId,
      name: ui.name,
      payload: ui.payload ?? null,
    };
  }

  const action = parseJsonSuffix<{ actionId?: string; decision?: string }>(
    content,
    PREFIXES.ACTION_DECISION,
  );
  if (action && typeof action.actionId === "string" && (action.decision === "approved" || action.decision === "declined")) {
    return { kind: "action-decision", actionId: action.actionId, decision: action.decision };
  }

  const disclosure = parseJsonSuffix<{
    requestId?: string;
    decision?: string;
    records?: Array<{ category: string; label: string; value: JsonValue }>;
  }>(content, PREFIXES.DATA_DISCLOSURE);
  if (
    disclosure &&
    typeof disclosure.requestId === "string" &&
    (disclosure.decision === "approved" || disclosure.decision === "declined")
  ) {
    return {
      kind: "data-disclosure",
      requestId: disclosure.requestId,
      decision: disclosure.decision,
      records: disclosure.decision === "approved" ? disclosure.records : undefined,
    };
  }

  const connector = parseJsonSuffix<{
    callId?: string;
    ok?: boolean;
    result?: unknown;
    error?: string;
  }>(content, PREFIXES.CONNECTOR_RESULT);
  if (connector && typeof connector.callId === "string" && typeof connector.ok === "boolean") {
    return {
      kind: "connector-result",
      callId: connector.callId,
      ok: connector.ok,
      result: connector.result,
      error: typeof connector.error === "string" ? connector.error : undefined,
    };
  }

  return { kind: "user-text", text: content };
}

/** Format shell-bound connector invoke results (agent ← shell). */
export function formatConnectorResultMessage(payload: {
  callId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}): string {
  return `${PREFIXES.CONNECTOR_RESULT}${JSON.stringify(payload)}`;
}

/** Format outbound shell messages (shell → agent). Mirrors AgUiAgentSession wire shape. */
export const formatAtomOutbound = {
  uiEvent(event: { surfaceId: string; nodeId: string; name: string; payload?: JsonValue | null }): string {
    return `${PREFIXES.UI_EVENT}${JSON.stringify({
      surfaceId: event.surfaceId,
      nodeId: event.nodeId,
      name: event.name,
      payload: event.payload ?? null,
    })}`;
  },
  actionDecision(actionId: string, decision: "approved" | "declined"): string {
    return `${PREFIXES.ACTION_DECISION}${JSON.stringify({ actionId, decision })}`;
  },
  dataDisclosure(
    requestId: string,
    decision: "approved" | "declined",
    records?: Array<{ category: string; label: string; value: JsonValue }>,
  ): string {
    const payload =
      decision === "approved" ? { requestId, decision, records } : { requestId, decision };
    return `${PREFIXES.DATA_DISCLOSURE}${JSON.stringify(payload)}`;
  },
  connectorResult(payload: {
    callId: string;
    ok: boolean;
    result?: unknown;
    error?: string;
  }): string {
    return formatConnectorResultMessage(payload);
  },
};
