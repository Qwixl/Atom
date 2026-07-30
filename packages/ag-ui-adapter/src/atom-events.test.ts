import { type CustomEvent } from "@ag-ui/client";
import { describe, expect, it } from "vitest";
import {
  ATOM_AGUI_EVENTS,
  atomSurfaceArrangeEvent,
  atomSurfacePinEvent,
  atomSurfaceReleaseEvent,
  mapCustomEventToOutput,
} from "./atom-events.js";
import { agentOutputToAgUiEvents } from "./server/outputEvents.js";

const composition = {
  version: 1 as const,
  surfaceId: "board-cal",
  root: { id: "title", component: "core/text", props: { text: "Today" } },
};

const surfacePin = {
  composition,
  bindings: [
    {
      nodeId: "title",
      prop: "text",
      source: { connector: "webcal", tool: "listEvents" },
    },
  ],
  refresh: {
    trigger: { type: "interval" as const, everyMinutes: 30 },
    staleAfterSeconds: 900,
  },
};

describe("persistent surface AG-UI events", () => {
  it("round-trips surface-pin via CUSTOM events", () => {
    const events = agentOutputToAgUiEvents({ type: "surface-pin", pin: surfacePin });
    expect(events).toHaveLength(1);
    const custom = events[0] as CustomEvent;
    expect(custom.name).toBe(ATOM_AGUI_EVENTS.SURFACE_PIN);

    const output = mapCustomEventToOutput(custom);
    expect(output).toEqual({ type: "surface-pin", pin: surfacePin });
  });

  it("round-trips surface-release via CUSTOM events", () => {
    const release = { surfaceId: "board-cal", reason: "trip ended" };
    const events = agentOutputToAgUiEvents({ type: "surface-release", release });
    const custom = events[0] as CustomEvent;
    expect(custom.name).toBe(ATOM_AGUI_EVENTS.SURFACE_RELEASE);
    expect(mapCustomEventToOutput(custom)).toEqual({ type: "surface-release", release });
  });

  it("round-trips surface-arrange via CUSTOM events", () => {
    const arrange = {
      placements: [{ surfaceId: "board-cal", screen: 1, order: 0, size: "l" as const }],
    };
    const events = agentOutputToAgUiEvents({ type: "surface-arrange", arrange });
    const custom = events[0] as CustomEvent;
    expect(custom.name).toBe(ATOM_AGUI_EVENTS.SURFACE_ARRANGE);
    expect(mapCustomEventToOutput(custom)).toEqual({ type: "surface-arrange", arrange });
  });

  it("builds atomSurfacePinEvent with the pin payload", () => {
    const event = atomSurfacePinEvent(surfacePin);
    expect(event.name).toBe("atom.surface-pin");
    expect(event.value).toEqual(surfacePin);
  });

  it("builds atomSurfaceReleaseEvent with surfaceId and reason", () => {
    const event = atomSurfaceReleaseEvent({ surfaceId: "board-cal", reason: "done" });
    expect(event.name).toBe("atom.surface-release");
    expect(event.value).toEqual({ surfaceId: "board-cal", reason: "done" });
  });

  it("builds atomSurfaceArrangeEvent with placements", () => {
    const arrange = { placements: [{ surfaceId: "a", order: 2 }] };
    const event = atomSurfaceArrangeEvent(arrange);
    expect(event.name).toBe("atom.surface-arrange");
    expect(event.value).toEqual(arrange);
  });

  it("accepts surface-pin shape without entitled connector list", () => {
    const event = atomSurfacePinEvent(surfacePin);
    const output = mapCustomEventToOutput(event as CustomEvent);
    expect(output?.type).toBe("surface-pin");
  });
});
