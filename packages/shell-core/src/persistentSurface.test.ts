import { describe, expect, it } from "vitest";
import {
  SURFACE_REFRESH_MIN_MINUTES,
  validateSurfaceArrange,
  validateSurfacePin,
  validateSurfacePinShape,
  validateSurfaceRelease,
} from "./persistentSurface.js";

const validComposition = {
  version: 1 as const,
  surfaceId: "board-cal",
  root: {
    id: "title",
    component: "core/text",
    props: { text: "Today" },
  },
};

function validPin(overrides: Record<string, unknown> = {}) {
  return {
    composition: validComposition,
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
    placement: { screen: 0, order: 1, size: "m" as const },
    ...overrides,
  };
}

describe("validateSurfacePin", () => {
  describe("rule 1 — composition validation", () => {
    it("accepts a pin whose composition passes validateComposition", () => {
      const result = validateSurfacePin(validPin(), { entitledConnectors: ["webcal"] });
      expect(result.ok).toBe(true);
    });

    it("rejects a pin whose composition fails validateComposition", () => {
      const result = validateSurfacePin(
        validPin({ composition: { version: 1, surfaceId: "", root: validComposition.root } }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("composition:"))).toBe(true);
      }
    });
  });

  describe("rule 2 — bindings nodeId resolution", () => {
    it("accepts bindings whose nodeId resolves in the composition tree", () => {
      const result = validateSurfacePin(
        validPin({
          composition: {
            ...validComposition,
            root: {
              id: "stack",
              component: "core/stack",
              children: [{ id: "leaf", component: "core/text", props: { text: "Hi" } }],
            },
          },
          bindings: [
            {
              nodeId: "leaf",
              prop: "text",
              source: { connector: "webcal", tool: "listEvents" },
            },
          ],
        }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(true);
    });

    it("rejects bindings whose nodeId does not resolve in the composition tree", () => {
      const result = validateSurfacePin(
        validPin({
          bindings: [
            {
              nodeId: "missing-node",
              prop: "text",
              source: { connector: "webcal", tool: "listEvents" },
            },
          ],
        }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("does not resolve"))).toBe(true);
      }
    });
  });

  describe("rule 3 — binding prop path", () => {
    it("accepts a plain-identifier dot path for bindings[].prop", () => {
      const result = validateSurfacePin(
        validPin({
          bindings: [
            {
              nodeId: "title",
              prop: "label.text",
              source: { connector: "webcal", tool: "listEvents" },
            },
          ],
        }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(true);
    });

    it("rejects prototype-pollution segments in bindings[].prop (__proto__)", () => {
      const result = validateSurfacePin(
        validPin({
          bindings: [
            {
              nodeId: "title",
              prop: "__proto__.text",
              source: { connector: "webcal", tool: "listEvents" },
            },
          ],
        }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("bindings[0].prop"))).toBe(true);
      }
    });

    it("rejects an empty bindings[].prop", () => {
      const result = validateSurfacePin(
        validPin({
          bindings: [
            {
              nodeId: "title",
              prop: "",
              source: { connector: "webcal", tool: "listEvents" },
            },
          ],
        }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
    });
  });

  describe("rule 4 — entitled connectors", () => {
    it("accepts bindings when source.connector is in entitledConnectors", () => {
      const result = validateSurfacePin(validPin(), { entitledConnectors: ["webcal"] });
      expect(result.ok).toBe(true);
    });

    it("rejects bindings when source.connector is not entitled", () => {
      const result = validateSurfacePin(validPin(), { entitledConnectors: ["rss"] });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("is not entitled"))).toBe(true);
      }
    });

    it("rejects bindings when entitledConnectors is empty", () => {
      const result = validateSurfacePin(validPin(), { entitledConnectors: [] });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("is not entitled"))).toBe(true);
      }
    });
  });

  describe("validateSurfacePinShape", () => {
    it("validateSurfacePinShape does not enforce entitlement (rule 4 is re-checked at apply)", () => {
      const result = validateSurfacePinShape(validPin());
      expect(result.ok).toBe(true);
    });
  });

  describe("rule 5 — refresh interval floor", () => {
    it("clamps refresh.trigger.everyMinutes to SURFACE_REFRESH_MIN_MINUTES", () => {
      const result = validateSurfacePin(
        validPin({
          refresh: {
            trigger: { type: "interval", everyMinutes: 5 },
            staleAfterSeconds: 600,
          },
        }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.refresh?.trigger).toEqual({
          type: "interval",
          everyMinutes: SURFACE_REFRESH_MIN_MINUTES,
        });
      }
    });

    it("keeps refresh.trigger.everyMinutes when it is at or above the floor", () => {
      const result = validateSurfacePin(
        validPin({
          refresh: {
            trigger: { type: "interval", everyMinutes: 45 },
            staleAfterSeconds: 600,
          },
        }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.refresh?.trigger).toEqual({ type: "interval", everyMinutes: 45 });
      }
    });
  });

  describe("rule 6 — staleAfterSeconds", () => {
    it("accepts a positive finite staleAfterSeconds", () => {
      const result = validateSurfacePin(validPin(), { entitledConnectors: ["webcal"] });
      expect(result.ok).toBe(true);
    });

    it("rejects a non-positive staleAfterSeconds", () => {
      const result = validateSurfacePin(
        validPin({
          refresh: {
            trigger: { type: "on-open" },
            staleAfterSeconds: 0,
          },
        }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("staleAfterSeconds"))).toBe(true);
      }
    });
  });

  describe("rule 7 — placement fields", () => {
    it("accepts valid placement screen, order, and size", () => {
      const result = validateSurfacePin(validPin(), { entitledConnectors: ["webcal"] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.placement).toEqual({ screen: 0, order: 1, size: "m" });
      }
    });

    it("rejects negative placement.screen", () => {
      const result = validateSurfacePin(
        validPin({ placement: { screen: -1 } }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("placement.screen"))).toBe(true);
      }
    });

    it("rejects non-integer placement.screen", () => {
      const result = validateSurfacePin(
        validPin({ placement: { screen: 1.5 } }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("placement.screen"))).toBe(true);
      }
    });

    it("rejects negative placement.order", () => {
      const result = validateSurfacePin(
        validPin({ placement: { order: -1 } }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("placement.order"))).toBe(true);
      }
    });

    it("rejects non-integer placement.order", () => {
      const result = validateSurfacePin(
        validPin({ placement: { order: 2.5 } }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("placement.order"))).toBe(true);
      }
    });

    it("rejects invalid placement.size", () => {
      const result = validateSurfacePin(
        validPin({ placement: { size: "xl" } }),
        { entitledConnectors: ["webcal"] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("placement.size"))).toBe(true);
      }
    });
  });

  describe("rule 8 — read-only board tiles", () => {
    it("accepts a read-only primitive composition", () => {
      const result = validateSurfacePin(
        validPin({ bindings: undefined }),
        { entitledConnectors: [] },
      );
      expect(result.ok).toBe(true);
    });

    it("rejects core/form nodes on a board tile", () => {
      const result = validateSurfacePin(
        validPin({
          composition: {
            ...validComposition,
            root: { id: "form", component: "core/form", children: [] },
          },
          bindings: undefined,
        }),
        { entitledConnectors: [] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("read-only"))).toBe(true);
      }
    });

    it("rejects consequential action shapes embedded in composition props", () => {
      const result = validateSurfacePin(
        validPin({
          composition: {
            ...validComposition,
            root: {
              id: "title",
              component: "core/text",
              props: {
                text: "Pay now",
                action: {
                  id: "pay-1",
                  kind: "payment",
                  title: "Pay",
                  terms: { amount: 10 },
                },
              },
            },
          },
          bindings: undefined,
        }),
        { entitledConnectors: [] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((error) => error.includes("consequential action shape"))).toBe(
          true,
        );
      }
    });
  });
});

describe("validateSurfaceRelease", () => {
  it("accepts a release with surfaceId", () => {
    const result = validateSurfaceRelease({ surfaceId: "board-cal", reason: "stale" });
    expect(result.ok).toBe(true);
  });

  it("rejects a release without surfaceId", () => {
    const result = validateSurfaceRelease({ reason: "stale" });
    expect(result.ok).toBe(false);
  });
});

describe("validateSurfaceArrange", () => {
  it("accepts non-empty placements with valid fields", () => {
    const result = validateSurfaceArrange({
      placements: [{ surfaceId: "a", screen: 0, order: 1, size: "s" }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects empty placements", () => {
    const result = validateSurfaceArrange({ placements: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate surfaceId values", () => {
    const result = validateSurfaceArrange({
      placements: [
        { surfaceId: "dup", order: 0 },
        { surfaceId: "dup", order: 1 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("duplicate surfaceId"))).toBe(true);
    }
  });

  it("rejects invalid placement.size", () => {
    const result = validateSurfaceArrange({
      placements: [{ surfaceId: "a", size: "xl" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("size"))).toBe(true);
    }
  });
});
