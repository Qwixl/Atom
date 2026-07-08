import { describe, expect, it } from "vitest";
import { EventType } from "@ag-ui/client";
import { mcpResultToAgUiEvents } from "./mapBrainResult.js";

describe("mcpResultToAgUiEvents", () => {
  it("wraps plain strings as text events", () => {
    const events = mcpResultToAgUiEvents("Hello from MCP brain");
    expect(events[0]?.type).toBe(EventType.TEXT_MESSAGE_START);
    expect(events.some((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true);
  });

  it("maps Atom JSON protocol objects", () => {
    const events = mcpResultToAgUiEvents({ type: "text", text: "Forecast ready." });
    expect(events.some((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true);
  });

  it("maps connector invoke requests", () => {
    const events = mcpResultToAgUiEvents({
      type: "connector-invoke",
      callId: "c1",
      connectorId: "weather",
      operation: "getStatus",
    });
    expect(events[0]?.type).toBe(EventType.CUSTOM);
    expect((events[0] as { name?: string }).name).toBe("atom.connector-invoke");
  });
});
