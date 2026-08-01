import { describe, expect, it } from "vitest";
import { shouldRefuseModeHHold } from "./modeHHoldRefuse.js";

describe("shouldRefuseModeHHold", () => {
  it("refuses merchant-checkout settlementMode", () => {
    expect(shouldRefuseModeHHold({ settlementMode: "merchant-checkout" })).toBe(true);
  });

  it("refuses offer-* and offer prefix subjects", () => {
    expect(shouldRefuseModeHHold({ subjectId: "offer-xyz" })).toBe(true);
    expect(shouldRefuseModeHHold({ subjectId: "offerings" })).toBe(true);
  });

  it("refuses known Mode H subjects via callback", () => {
    expect(
      shouldRefuseModeHHold({
        subjectId: "pending-uuid",
        isModeHHoldSubject: (id) => id === "pending-uuid",
      }),
    ).toBe(true);
  });

  it("allows empty subject without settlementMode or callback hit", () => {
    expect(shouldRefuseModeHHold({ subjectId: "" })).toBe(false);
    expect(
      shouldRefuseModeHHold({
        subjectId: "room-legacy",
        isModeHHoldSubject: () => false,
      }),
    ).toBe(false);
  });
});
