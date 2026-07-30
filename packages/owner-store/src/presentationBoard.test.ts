import type { JsonValue } from "@qwixl/shell-core";
import { describe, expect, it } from "vitest";
import {
  emptyPresentationBoardState,
  emptyPresentationBoardStateV2,
  parsePresentationBoardState,
  parsePresentationBoardStateV2,
  type PersistedSurface,
  type PresentationBoardStateV2,
} from "./presentationBoard.js";

const validComposition = {
  version: 1 as const,
  surfaceId: "board-cal",
  root: {
    id: "title",
    component: "core/text",
    props: { text: "Today" },
  },
};

function validPersistedSurface(overrides: Partial<PersistedSurface> = {}): PersistedSurface {
  return {
    surfaceId: "board-cal",
    composition: validComposition,
    bindings: [
      {
        nodeId: "title",
        prop: "text",
        source: { connector: "webcal", tool: "listEvents" },
      },
    ],
    refresh: {
      trigger: { type: "interval", everyMinutes: 30 },
      staleAfterSeconds: 900,
    },
    placement: { screen: 0, order: 1, size: "m" },
    ownerOverrides: [],
    lastRefreshedAt: {},
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    ...overrides,
  };
}

function validV2State(overrides: Partial<PresentationBoardStateV2> = {}): PresentationBoardStateV2 {
  return {
    schemaVersion: 2,
    surfaces: [validPersistedSurface()],
    dismissed: [],
    updatedAt: 1_700_000_200_000,
    ...overrides,
  };
}

function asStoredJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as unknown as JsonValue;
}

describe("parsePresentationBoardState (v1)", () => {
  it("still parses v1 regions for the existing board module path", () => {
    const result = parsePresentationBoardState({
      schemaVersion: 1,
      regions: [{ id: "daily", title: "Daily briefing", body: "Hello" }],
      updatedAt: 42,
    });
    expect(result.schemaVersion).toBe(1);
    expect(result.regions).toEqual([
      { id: "daily", title: "Daily briefing", body: "Hello", pinned: false },
    ]);
    expect(result.updatedAt).toBe(42);
  });
});

describe("parsePresentationBoardStateV2 round-trip", () => {
  it("serialises and parses v2 state to deep-equal", () => {
    const original = validV2State({
      dismissed: [{ surfaceId: "old-tile", at: 1_700_000_050_000 }],
      surfaces: [
        validPersistedSurface({
          lastRefreshedAt: { "title:text": 1_700_000_090_000 },
          lastError: { at: 1_700_000_080_000, message: "connector timeout" },
          ownerOverrides: ["pinned", "screen"],
        }),
      ],
    });
    const parsed = parsePresentationBoardStateV2(asStoredJson(original));
    expect(parsed).toEqual(original);
  });
});

describe("parsePresentationBoardStateV2 migration", () => {
  it("migrates a real v1 payload without inventing surfaces", () => {
    const v1 = {
      schemaVersion: 1,
      regions: [
        { id: "region-1", title: "Weather", body: "Sunny", pinned: true },
        { id: "region-2", title: "Calendar" },
      ],
      updatedAt: 9_876_543,
    };
    const migrated = parsePresentationBoardStateV2(asStoredJson(v1));
    expect(migrated).toEqual({
      schemaVersion: 2,
      surfaces: [],
      dismissed: [],
      updatedAt: 9_876_543,
    });
    expect(parsePresentationBoardState(asStoredJson(v1)).regions).toHaveLength(2);
  });

  it("migrates missing schemaVersion with regions to empty surfaces", () => {
    const migrated = parsePresentationBoardStateV2({
      regions: [{ id: "a", title: "A" }],
      updatedAt: 100,
    });
    expect(migrated.surfaces).toEqual([]);
    expect(migrated.schemaVersion).toBe(2);
  });
});

describe("parsePresentationBoardStateV2 garbage input", () => {
  it("returns empty v2 state for null", () => {
    const result = parsePresentationBoardStateV2(null);
    expect(result.schemaVersion).toBe(2);
    expect(result.surfaces).toEqual([]);
    expect(result.dismissed).toEqual([]);
  });

  it("returns empty v2 state for an array", () => {
    const result = parsePresentationBoardStateV2([]);
    expect(result.schemaVersion).toBe(2);
    expect(result.surfaces).toEqual([]);
    expect(result.dismissed).toEqual([]);
  });

  it("returns empty v2 state for malformed surfaces field", () => {
    const result = parsePresentationBoardStateV2({ schemaVersion: 2, surfaces: 3, updatedAt: 1 });
    expect(result.surfaces).toEqual([]);
    expect(result.dismissed).toEqual([]);
    expect(result.schemaVersion).toBe(2);
  });
});

describe("parsePresentationBoardStateV2 partial surface invalidity", () => {
  it("skips the whole surface when any binding fails validation", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [
        {
          ...validPersistedSurface(),
          bindings: [
            {
              nodeId: "title",
              prop: "text",
              source: { connector: "webcal", tool: "listEvents" },
            },
            {
              nodeId: "missing-node",
              prop: "text",
              source: { connector: "webcal", tool: "listEvents" },
            },
          ],
        },
      ],
      dismissed: [],
      updatedAt: 1,
    } as unknown as JsonValue);
    expect(result.surfaces).toEqual([]);
  });

  it("keeps the surface only when every binding is valid", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [validPersistedSurface()],
      dismissed: [],
      updatedAt: 1,
    } as unknown as JsonValue);
    expect(result.surfaces).toHaveLength(1);
    expect(result.surfaces[0]?.bindings).toHaveLength(1);
  });
});

describe("parsePresentationBoardStateV2 lastRefreshedAt", () => {
  it("drops entries whose key does not match a binding on the surface", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [
        validPersistedSurface({
          lastRefreshedAt: {
            "title:text": 100,
            "orphan:prop": 200,
          },
        }),
      ],
      dismissed: [],
      updatedAt: 1,
    } as unknown as JsonValue);
    expect(result.surfaces[0]?.lastRefreshedAt).toEqual({ "title:text": 100 });
  });

  it("does not default missing binding keys to now", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [validPersistedSurface({ lastRefreshedAt: {} })],
      dismissed: [],
      updatedAt: 1,
    } as unknown as JsonValue);
    expect(result.surfaces[0]?.lastRefreshedAt).toEqual({});
  });
});

describe("parsePresentationBoardStateV2 dismissed entries", () => {
  it("accepts valid dismissed entries and skips malformed ones", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [],
      dismissed: [
        { surfaceId: "gone", at: 50 },
        { surfaceId: "", at: 60 },
        { surfaceId: "bad-at" },
      ],
      updatedAt: 1,
    });
    expect(result.dismissed).toEqual([{ surfaceId: "gone", at: 50 }]);
  });
});

describe("parsePresentationBoardStateV2 surface field validation", () => {
  it("skips a surface with an invalid composition", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [
        {
          ...validPersistedSurface(),
          composition: { version: 1, surfaceId: "", root: validComposition.root },
        },
      ],
      dismissed: [],
      updatedAt: 1,
    } as unknown as JsonValue);
    expect(result.surfaces).toEqual([]);
  });

  it("skips a surface when surfaceId does not match composition.surfaceId", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [
        validPersistedSurface({
          surfaceId: "board-other",
        }),
      ],
      dismissed: [],
      updatedAt: 1,
    } as unknown as JsonValue);
    expect(result.surfaces).toEqual([]);
  });

  it("skips a surface with invalid placement", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [validPersistedSurface({ placement: { screen: -1 } })],
      dismissed: [],
      updatedAt: 1,
    } as unknown as JsonValue);
    expect(result.surfaces).toEqual([]);
  });

  it("skips a surface with invalid refresh", () => {
    const result = parsePresentationBoardStateV2({
      schemaVersion: 2,
      surfaces: [
        validPersistedSurface({
          refresh: { trigger: { type: "interval", everyMinutes: 30 }, staleAfterSeconds: 0 },
        }),
      ],
      dismissed: [],
      updatedAt: 1,
    } as unknown as JsonValue);
    expect(result.surfaces).toEqual([]);
  });
});

describe("emptyPresentationBoardStateV2", () => {
  it("returns schemaVersion 2 with empty collections", () => {
    const empty = emptyPresentationBoardStateV2();
    expect(empty.schemaVersion).toBe(2);
    expect(empty.surfaces).toEqual([]);
    expect(empty.dismissed).toEqual([]);
    expect(typeof empty.updatedAt).toBe("number");
  });
});

describe("emptyPresentationBoardState (v1)", () => {
  it("remains unchanged for v1 callers", () => {
    expect(emptyPresentationBoardState()).toEqual({
      schemaVersion: 1,
      regions: [],
      updatedAt: expect.any(Number),
    });
  });
});
