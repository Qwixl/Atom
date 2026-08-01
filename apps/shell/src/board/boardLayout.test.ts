import { describe, expect, it } from "vitest";
import type { PersistedSurface } from "@qwixl/owner-store";
import type { CompositionNode, JsonValue, ResolvedNode, ResolvedSurface } from "@qwixl/shell-core";
import {
  boardPanelSections,
  clampAgentScreen,
  effectivePlacement,
  formatBoardSurfaceDisplay,
  formatBoardTableCellDisplay,
  formatBoardTileTitle,
  isTileStale,
  layoutBoardScreens,
  maxAllowedAgentScreen,
  tileAsOf,
} from "./boardLayout.js";

const composition = {
  version: 1 as const,
  surfaceId: "tile-a",
  root: { id: "root", component: "core/text", props: { text: "Hi" } },
};

function makeSurface(overrides: Partial<PersistedSurface> & { surfaceId: string }): PersistedSurface {
  const { surfaceId, ...rest } = overrides;
  return {
    surfaceId,
    composition: { ...composition, surfaceId },
    bindings: [
      { nodeId: "root", prop: "text", source: { connector: "webcal", tool: "listEvents" } },
    ],
    placement: { screen: 0, order: 0, size: "m" },
    ownerOverrides: [],
    lastRefreshedAt: {},
    createdAt: 1,
    updatedAt: 1,
    ...rest,
  };
}

describe("boardPanelSections", () => {
  it("shows v2 surfaces and v1 regions together when both are present", () => {
    expect(boardPanelSections({ v1RegionCount: 2, v2SurfaceCount: 1 })).toEqual({
      showV2Board: true,
      showV1Module: true,
      showEmpty: false,
    });
  });

  it("shows only v1 regions when there are no v2 surfaces", () => {
    expect(boardPanelSections({ v1RegionCount: 1, v2SurfaceCount: 0 })).toEqual({
      showV2Board: false,
      showV1Module: true,
      showEmpty: false,
    });
  });
});

describe("formatBoardTileTitle", () => {
  it("collapses newlines to a single line", () => {
    expect(formatBoardTileTitle("Line one\nLine two\r\nLine three", "fallback")).toBe(
      "Line one Line two Line three",
    );
  });

  it("caps long agent-authored titles with an ellipsis", () => {
    const long = "a".repeat(100);
    const formatted = formatBoardTileTitle(long, "fallback");
    expect(formatted.length).toBeLessThanOrEqual(80);
    expect(formatted.endsWith("…")).toBe(true);
  });
});

describe("effectivePlacement", () => {
  it("applies agent placement when the owner has no override", () => {
    const surface = makeSurface({ surfaceId: "a", placement: { screen: 0, order: 0 } });
    const placement = effectivePlacement(surface, { screen: 2, order: 3, size: "l" });
    expect(placement).toEqual({ screen: 2, order: 3, size: "l", pinned: false });
  });

  it("keeps owner pinned placement over an agent move", () => {
    const surface = makeSurface({
      surfaceId: "a",
      placement: { screen: 0, order: 1, pinned: true },
      ownerOverrides: ["pinned", "screen"],
    });
    const placement = effectivePlacement(surface, { screen: 2, order: 9, pinned: false });
    expect(placement.screen).toBe(0);
    expect(placement.pinned).toBe(true);
    expect(placement.order).toBe(9);
  });

  it("keeps owner size over an agent resize", () => {
    const surface = makeSurface({
      surfaceId: "a",
      placement: { size: "l" },
      ownerOverrides: ["size"],
    });
    const placement = effectivePlacement(surface, { size: "s" });
    expect(placement.size).toBe("l");
  });

  it("keeps owner order while agent placement re-flows other tiles", () => {
    const pinned = makeSurface({
      surfaceId: "a",
      placement: { order: 2, screen: 0 },
      ownerOverrides: ["order"],
    });
    const other = makeSurface({ surfaceId: "b", placement: { order: 0, screen: 0 } });
    const layout = layoutBoardScreens([pinned, other], {
      a: { order: 99 },
      b: { order: 1 },
    });
    const tiles = layout[0]!.tiles;
    expect(tiles.find((tile) => tile.surface.surfaceId === "a")?.placement.order).toBe(2);
    expect(tiles.find((tile) => tile.surface.surfaceId === "b")?.placement.order).toBe(1);
  });
});

describe("clampAgentScreen", () => {
  it("clamps an out-of-range agent screen to maxOccupied + 1", () => {
    const surfaces = [
      makeSurface({ surfaceId: "a", placement: { screen: 0, order: 0 } }),
      makeSurface({ surfaceId: "b", placement: { screen: 1, order: 0 } }),
    ];
    const layout = layoutBoardScreens(surfaces, { b: { screen: 5 } });
    const screen = layout.find((entry) =>
      entry.tiles.some((tile) => tile.surface.surfaceId === "b"),
    )?.screen;
    expect(screen).toBe(2);
    expect(clampAgentScreen(5, 1)).toBe(2);
  });

  it("allows agent placement on exactly maxOccupied + 1", () => {
    const surfaces = [makeSurface({ surfaceId: "a", placement: { screen: 0, order: 0 } })];
    const layout = layoutBoardScreens(surfaces, { a: { screen: 1 } });
    expect(layout.some((entry) => entry.screen === 1)).toBe(true);
    expect(maxAllowedAgentScreen(0)).toBe(1);
    expect(clampAgentScreen(1, 0)).toBe(1);
  });

  it("clamps agent placement beyond maxOccupied + 2 down to maxOccupied + 1", () => {
    const surfaces = [makeSurface({ surfaceId: "a", placement: { screen: 0, order: 0 } })];
    const layout = layoutBoardScreens(surfaces, { a: { screen: 3 } });
    expect(layout[0]?.screen).toBe(1);
    expect(clampAgentScreen(3, 0)).toBe(1);
  });
});

describe("tileAsOf", () => {
  it("returns never-refreshed when any binding lacks a timestamp", () => {
    const bindings = makeSurface({ surfaceId: "a" }).bindings;
    expect(tileAsOf(bindings, {})).toEqual({ kind: "never-refreshed" });
    const twoBindings = makeSurface({
      surfaceId: "b",
      bindings: [
        { nodeId: "root", prop: "text", source: { connector: "webcal", tool: "listEvents" } },
        { nodeId: "root", prop: "label", source: { connector: "rss", tool: "listItems" } },
      ],
    }).bindings;
    expect(tileAsOf(twoBindings, { "root:text": 100 })).toEqual({ kind: "never-refreshed" });
  });

  it("returns the oldest timestamp when every binding has an entry", () => {
    const surface = makeSurface({
      surfaceId: "a",
      bindings: [
        { nodeId: "root", prop: "text", source: { connector: "webcal", tool: "listEvents" } },
        { nodeId: "root", prop: "label", source: { connector: "rss", tool: "listItems" } },
      ],
      lastRefreshedAt: { "root:text": 200, "root:label": 100 },
    });
    expect(tileAsOf(surface.bindings, surface.lastRefreshedAt)).toEqual({
      kind: "as-of",
      at: 100,
    });
  });

  it("does not invent a timestamp for never-refreshed tiles", () => {
    const bindings = makeSurface({ surfaceId: "a" }).bindings;
    expect(tileAsOf(bindings, {}).kind).toBe("never-refreshed");
    expect(isTileStale({ trigger: { type: "on-open" }, staleAfterSeconds: 60 }, bindings, {}, 9_999_999)).toBe(
      true,
    );
  });
});

describe("isTileStale", () => {
  it("marks a tile stale after staleAfterSeconds from the oldest as-of", () => {
    const bindings = makeSurface({ surfaceId: "a" }).bindings;
    const refresh = { trigger: { type: "interval" as const, everyMinutes: 15 }, staleAfterSeconds: 60 };
    const lastRefreshedAt = { "root:text": 1_000 };
    expect(isTileStale(refresh, bindings, lastRefreshedAt, 1_000 + 60_000)).toBe(false);
    expect(isTileStale(refresh, bindings, lastRefreshedAt, 1_000 + 60_001)).toBe(true);
  });
});

const displayFormat = { locale: "en-GB", timeZone: "UTC" } as const;

function mockTableResolved(rows: JsonValue[][]): ResolvedSurface {
  const node: CompositionNode = {
    id: "events-table",
    component: "core/table",
    props: { columns: ["When", "Event"], rows },
  };
  const root: ResolvedNode = {
    kind: "component",
    node,
    entry: {
      origin: "core",
      spec: { component: "core/table", name: "core/table" },
    },
    children: [],
  };
  return { surfaceId: "board-cal", root, degraded: false };
}

describe("formatBoardTableCellDisplay", () => {
  it("formats an ISO datetime with Z to a readable local datetime", () => {
    const formatted = formatBoardTableCellDisplay("2026-07-30T09:00:00.000Z", displayFormat);
    expect(formatted).not.toBe("2026-07-30T09:00:00.000Z");
    expect(String(formatted)).toMatch(/Thu/);
    expect(String(formatted)).toMatch(/30 Jul/);
    expect(String(formatted)).toMatch(/09:00/);
  });

  it("formats a date-only ISO value without a time component", () => {
    const formatted = formatBoardTableCellDisplay("2026-07-30", displayFormat);
    expect(String(formatted)).toMatch(/Thu/);
    expect(String(formatted)).toMatch(/30 Jul/);
    expect(String(formatted)).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("leaves non-ISO strings, numbers, booleans, and empty strings unchanged", () => {
    expect(formatBoardTableCellDisplay("Standup", displayFormat)).toBe("Standup");
    expect(formatBoardTableCellDisplay("", displayFormat)).toBe("");
    expect(formatBoardTableCellDisplay(42, displayFormat)).toBe(42);
    expect(formatBoardTableCellDisplay(true, displayFormat)).toBe(true);
    expect(formatBoardTableCellDisplay("07/30/2026", displayFormat)).toBe("07/30/2026");
    expect(formatBoardTableCellDisplay("2026-07-30T09:00:00", displayFormat)).toBe(
      "2026-07-30T09:00:00",
    );
  });

  it("returns a pattern-matching but invalid date raw, never Invalid Date", () => {
    const invalid = "2026-02-30";
    const formatted = formatBoardTableCellDisplay(invalid, displayFormat);
    expect(formatted).toBe(invalid);
    expect(String(formatted)).not.toBe("Invalid Date");
    expect(String(formatted)).not.toContain("Invalid");
  });

  it("leaves stringified JSON cells unchanged", () => {
    const json = '{"room":"A","floor":2}';
    expect(formatBoardTableCellDisplay(json, displayFormat)).toBe(json);
  });
});

describe("formatBoardSurfaceDisplay", () => {
  it("formats core/table rows on a copy without mutating the resolved or persisted composition", () => {
    const composition = {
      version: 1 as const,
      surfaceId: "board-cal",
      root: {
        id: "events-table",
        component: "core/table",
        props: {
          columns: ["When", "Event"],
          rows: [["2026-07-30T09:00:00.000Z", "Standup"]],
        },
      },
    };
    const compositionBefore = structuredClone(composition);
    const resolved = mockTableResolved(composition.root.props!.rows as JsonValue[][]);
    const resolvedBefore = structuredClone(resolved);

    const formatted = formatBoardSurfaceDisplay(resolved, displayFormat);
    const rows = formatted.root.node.props?.rows as string[][];

    expect(composition).toEqual(compositionBefore);
    expect(resolved).toEqual(resolvedBefore);
    expect(rows[0]?.[0]).not.toBe("2026-07-30T09:00:00.000Z");
    expect(rows[0]?.[1]).toBe("Standup");
    expect(String(rows[0]?.[0])).toMatch(/09:00/);
  });
});
