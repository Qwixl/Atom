import { describe, expect, it } from "vitest";
import { buildAtomAgentCard, ATOM_OFFLINE_DELIVERY_EXTENSION } from "@qwixl/a2a-transport";
import {
  effectiveReachabilityMode,
  type ReachabilityConfig,
} from "./reachability.js";

/** Same predicate as server.ts card wiring (D134). */
function offlineDeliveryModeForCard(
  config: ReachabilityConfig,
): "sleep" | "hourly_wake" | undefined {
  const mode = effectiveReachabilityMode(config);
  return mode === "sleep" || mode === "hourly_wake" ? mode : undefined;
}

describe("ST-04c offline delivery card wiring (D134)", () => {
  it("maps sleep and hourly_wake to card extension mode", () => {
    for (const mode of ["sleep", "hourly_wake"] as const) {
      const offlineMode = offlineDeliveryModeForCard({
        mode,
        wakeSeed: "x",
        forceAlwaysOn: false,
      });
      expect(offlineMode).toBe(mode);
      const card = buildAtomAgentCard({
        name: "a",
        description: "d",
        baseUrl: "https://example.test",
        offlineDeliveryMode: offlineMode,
      });
      expect(
        card.capabilities?.extensions?.find((e) => e.uri === ATOM_OFFLINE_DELIVERY_EXTENSION)
          ?.params,
      ).toEqual({ mode });
    }
  });

  it("omits extension for always_on, session, and forceAlwaysOn sleep", () => {
    expect(
      offlineDeliveryModeForCard({
        mode: "always_on",
        wakeSeed: "x",
        forceAlwaysOn: false,
      }),
    ).toBeUndefined();
    expect(
      offlineDeliveryModeForCard({
        mode: "session",
        wakeSeed: "x",
        forceAlwaysOn: false,
      }),
    ).toBeUndefined();
    expect(
      offlineDeliveryModeForCard({
        mode: "sleep",
        wakeSeed: "x",
        forceAlwaysOn: true,
      }),
    ).toBeUndefined();
  });
});
