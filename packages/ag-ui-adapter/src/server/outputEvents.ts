import { EventType, type BaseEvent } from "@ag-ui/client";
import {
  atomCompositionEvent,
  atomConsequentialActionEvent,
  atomConnectorInvokeEvent,
  atomDataRequestEvent,
  atomGameMoveEvent,
  atomSurfaceArrangeEvent,
  atomSurfacePinEvent,
  atomSurfaceReleaseEvent,
} from "../atom-events.js";
import type { AgentOutput } from "@qwixl/shell-core";
import { v4 as uuid } from "uuid";

export function textAgUiEvents(messageId: string, text: string): BaseEvent[] {
  return [
    { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text },
    { type: EventType.TEXT_MESSAGE_END, messageId },
  ];
}

export function agentOutputToAgUiEvents(output: AgentOutput): BaseEvent[] {
  if (output.type === "text") {
    return textAgUiEvents(uuid(), output.text);
  }
  if (output.type === "composition") {
    return [atomCompositionEvent(output.composition)];
  }
  if (output.type === "consequential-action") {
    return [atomConsequentialActionEvent(output.surfaceId, output.action)];
  }
  if (output.type === "data-request") {
    return [atomDataRequestEvent(output.request)];
  }
  if (output.type === "game-move") {
    return [atomGameMoveEvent(output.surfaceId, output.move)];
  }
  if (output.type === "surface-pin") {
    return [atomSurfacePinEvent(output.pin)];
  }
  if (output.type === "surface-release") {
    return [atomSurfaceReleaseEvent(output.release)];
  }
  if (output.type === "surface-arrange") {
    return [atomSurfaceArrangeEvent(output.arrange)];
  }
  return [];
}

export { atomConnectorInvokeEvent, atomGameMoveEvent };
