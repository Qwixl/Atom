import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { RoomVerificationReport, RoomVerificationSummary } from "./comms/client.js";
import {
  RoomVerificationBanner,
  shouldShowRoomVerificationBanner,
} from "./RoomVerificationBanner.js";

const emptySummary: RoomVerificationSummary = {
  verified: 0,
  legacy: 0,
  unsigned: 0,
  invalid: 0,
  substituted: 0,
  omitted: 0,
};

function memberReport(
  partial: {
    summary?: Partial<RoomVerificationSummary>;
    forks?: Array<{ objectId: string; senderDid: string; n: number; at: string }>;
  } = {},
): RoomVerificationReport {
  return {
    role: "member",
    summary: { ...emptySummary, ...partial.summary },
    omissions: [],
    forks: partial.forks ?? [],
  };
}

function renderBanner(
  verification: RoomVerificationReport | null,
  opts: { canLeave?: boolean } = {},
): string {
  const html = renderToStaticMarkup(
    createElement(RoomVerificationBanner, {
      verification,
      canLeave: opts.canLeave ?? true,
      onReport: vi.fn(),
      onLeave: vi.fn(),
    }),
  );
  // renderToStaticMarkup escapes apostrophes; decode so assertions match the exact copy.
  return html.replace(/&#x27;/g, "'");
}

describe("shouldShowRoomVerificationBanner", () => {
  it("hides when every count is zero", () => {
    expect(shouldShowRoomVerificationBanner(memberReport())).toBe(false);
  });

  it("hides when only legacy is non-zero", () => {
    expect(shouldShowRoomVerificationBanner(memberReport({ summary: { legacy: 4 } }))).toBe(false);
  });

  it("hides for host role", () => {
    expect(shouldShowRoomVerificationBanner({ role: "host" })).toBe(false);
  });

  it("shows for substituted", () => {
    expect(shouldShowRoomVerificationBanner(memberReport({ summary: { substituted: 2 } }))).toBe(
      true,
    );
  });
});

describe("RoomVerificationBanner", () => {
  it("renders nothing when every count is zero", () => {
    expect(renderBanner(memberReport())).toBe("");
  });

  it("renders nothing when only legacy is non-zero", () => {
    expect(renderBanner(memberReport({ summary: { legacy: 3 } }))).toBe("");
  });

  it("shows the substituted line", () => {
    const html = renderBanner(memberReport({ summary: { substituted: 2 } }));
    expect(html).toContain("This room's history doesn't fully check out");
    expect(html).toContain(
      "2 messages were shown with different text than what was signed. Atom is displaying the signed original.",
    );
  });

  it("shows the omission line with the delivery/withholding hedge", () => {
    const html = renderBanner(memberReport({ summary: { omitted: 2 } }));
    expect(html).toContain(
      "2 messages you received directly are missing from the history the host serves. This could be a delivery fault or the host withholding them — Atom can't tell which.",
    );
  });

  it("omits Leave room when canLeave is false", () => {
    const html = renderBanner(memberReport({ summary: { invalid: 1 } }), { canLeave: false });
    expect(html).toContain("Report room");
    expect(html).not.toContain("Leave room");
  });

  it("uses singular message for a count of 1", () => {
    const html = renderBanner(memberReport({ summary: { invalid: 1 } }));
    expect(html).toContain("1 message failed its signature check.");
    expect(html).not.toContain("1 messages failed");
    expect(html).not.toContain("their signature check");
  });

  it("includes legacy note only when the banner is already visible", () => {
    const withLegacyAlone = renderBanner(memberReport({ summary: { legacy: 5 } }));
    expect(withLegacyAlone).toBe("");

    const withFinding = renderBanner(
      memberReport({ summary: { substituted: 1, legacy: 5 } }),
    );
    expect(withFinding).toContain(
      "5 messages predate signing in this room and can't be checked.",
    );
    expect(withFinding).toContain(
      "1 message was shown with different text than what was signed. Atom is displaying the signed original.",
    );
  });
});
