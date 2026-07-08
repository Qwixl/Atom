import { EventType, type BaseEvent } from "@ag-ui/client";
import { atomConnectorInvokeEvent, agentOutputToAgUiEvents, textAgUiEvents } from "@qwixl/ag-ui-adapter/server";
import type { AgentOutput, Composition, ConsequentialAction, DataRequest, JsonValue } from "@qwixl/shell-core";
import { v4 as uuid } from "uuid";

function asAgentOutput(raw: Record<string, unknown>): AgentOutput | null {
  const type = raw.type;
  if (type === "text" && typeof raw.text === "string") {
    return { type: "text", text: raw.text };
  }
  if (type === "composition" && raw.composition && typeof raw.composition === "object") {
    return { type: "composition", composition: raw.composition as Composition };
  }
  if (type === "consequential-action" && typeof raw.surfaceId === "string" && raw.action) {
    return {
      type: "consequential-action",
      surfaceId: raw.surfaceId,
      action: raw.action as ConsequentialAction,
    };
  }
  if (type === "data-request" && raw.request && typeof raw.request === "object") {
    return { type: "data-request", request: raw.request as DataRequest };
  }
  if (type === "game-move" && typeof raw.surfaceId === "string") {
    return { type: "game-move", surfaceId: raw.surfaceId, move: (raw.move ?? null) as JsonValue };
  }
  return null;
}

/** Map MCP tool result → AG-UI SSE events (BK-16 brain contract). */
export function mcpResultToAgUiEvents(raw: unknown): BaseEvent[] {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return mcpResultToAgUiEvents(JSON.parse(trimmed));
      } catch {
        return textAgUiEvents(uuid(), raw);
      }
    }
    return textAgUiEvents(uuid(), raw);
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    if (record.type === "connector-invoke") {
      const callId = typeof record.callId === "string" ? record.callId : uuid();
      const connectorId = typeof record.connectorId === "string" ? record.connectorId : "";
      const operation = typeof record.operation === "string" ? record.operation : "";
      if (connectorId && operation) {
        return [
          atomConnectorInvokeEvent({
            callId,
            connectorId: connectorId as never,
            operation,
            input:
              record.input && typeof record.input === "object" && !Array.isArray(record.input)
                ? (record.input as Record<string, unknown>)
                : undefined,
          }),
        ];
      }
    }
    const output = asAgentOutput(record);
    if (output) return agentOutputToAgUiEvents(output);
    if (typeof record.text === "string") return textAgUiEvents(uuid(), record.text);
    if (Array.isArray(record.content)) {
      const textPart = record.content.find(
        (part): part is { type: string; text: string } =>
          !!part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "text" &&
          typeof (part as { text?: string }).text === "string",
      );
      if (textPart) return mcpResultToAgUiEvents(textPart.text);
    }
  }

  return textAgUiEvents(uuid(), JSON.stringify(raw));
}

export function eventsIncludeConnectorInvoke(events: BaseEvent[]): boolean {
  return events.some((event) => {
    if (event.type !== EventType.CUSTOM) return false;
    const name = (event as unknown as { name?: string }).name;
    return name === "atom.connector-invoke";
  });
}
