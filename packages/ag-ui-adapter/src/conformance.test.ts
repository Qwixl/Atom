import { EventType, type CustomEvent } from "@ag-ui/client";
import { describe, expect, it } from "vitest";
import { ATOM_AGUI_EVENTS, atomGameMoveEvent, mapCustomEventToOutput } from "./atom-events.js";
import { formatAtomOutbound, parseAtomInboundMessage } from "./inbound.js";
import { agentOutputToAgUiEvents } from "./server/outputEvents.js";

describe("AG-UI wire parity (BK-11)", () => {
  it("round-trips game-move via CUSTOM events", () => {
    const events = agentOutputToAgUiEvents({
      type: "game-move",
      surfaceId: "ttt-1",
      move: { cell: 4 },
    });
    expect(events).toHaveLength(1);
    const custom = events[0] as CustomEvent;
    expect(custom.name).toBe(ATOM_AGUI_EVENTS.GAME_MOVE);

    const output = mapCustomEventToOutput(custom);
    expect(output).toEqual({
      type: "game-move",
      surfaceId: "ttt-1",
      move: { cell: 4 },
    });
  });

  it("builds atomGameMoveEvent with surfaceId and move", () => {
    const event = atomGameMoveEvent("bs-1", { action: "fire", cell: 14 });
    expect(event.name).toBe("atom.game-move");
    expect(event.value).toEqual({ surfaceId: "bs-1", move: { action: "fire", cell: 14 } });
  });
});

describe("inbound bracket protocol", () => {
  it("parses ui-event messages", () => {
    const msg = formatAtomOutbound.uiEvent({
      surfaceId: "s1",
      nodeId: "n1",
      name: "selected",
      payload: { optionId: "a" },
    });
    expect(parseAtomInboundMessage(msg)).toEqual({
      kind: "ui-event",
      surfaceId: "s1",
      nodeId: "n1",
      name: "selected",
      payload: { optionId: "a" },
    });
  });

  it("parses connector-result messages", () => {
    const msg = formatAtomOutbound.connectorResult({
      callId: "c1",
      ok: true,
      result: { items: [] },
    });
    expect(parseAtomInboundMessage(msg)).toEqual({
      kind: "connector-result",
      callId: "c1",
      ok: true,
      result: { items: [] },
    });
  });

  it("falls back to user-text for plain messages", () => {
    expect(parseAtomInboundMessage("hello brain")).toEqual({
      kind: "user-text",
      text: "hello brain",
    });
  });
});

describe("agentOutputToAgUiEvents golden fixtures", () => {
  it("maps all AgentOutput variants to CUSTOM or TEXT events", () => {
    const composition = {
      version: 1 as const,
      surfaceId: "surf-1",
      root: { id: "root", component: "core/text", props: { text: "Hi" } },
    };
    const outputs = [
      { type: "text" as const, text: "Hello" },
      { type: "composition" as const, composition },
      {
        type: "consequential-action" as const,
        surfaceId: "surf-1",
        action: {
          id: "a1",
          kind: "confirmation" as const,
          title: "Confirm",
          terms: { x: 1 },
        },
      },
      {
        type: "data-request" as const,
        request: { requestId: "r1", categories: ["identity"], reason: "Need name" },
      },
      { type: "game-move" as const, surfaceId: "g1", move: { cell: 0 } },
    ];

    for (const output of outputs) {
      const events = agentOutputToAgUiEvents(output);
      expect(events.length).toBeGreaterThan(0);
      if (output.type === "text") {
        expect(events[0]?.type).toBe(EventType.TEXT_MESSAGE_START);
        continue;
      }
      const custom = events[0] as CustomEvent;
      const roundTrip = mapCustomEventToOutput(custom);
      expect(roundTrip).toEqual(output);
    }
  });
});
