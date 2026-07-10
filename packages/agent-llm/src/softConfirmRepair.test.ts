import { describe, expect, it } from "vitest";
import {
  ownerMessageNeedsSettingsProposal,
  protocolHasSettingsProposal,
  protocolMessagesHaveSettingsProposal,
  softConfirmRepairUserContent,
  SOFT_CONFIRM_REPAIR_TAG,
} from "./softConfirmRepair.js";

describe("softConfirmRepair", () => {
  it("detects XRP track/alert eval scenario", () => {
    expect(
      ownerMessageNeedsSettingsProposal(
        "Find the XRP price, give me a daily update, and alert if it fluctuates 5% over the week",
      ),
    ).toBe(true);
  });

  it("detects keep-me-updated asks", () => {
    expect(ownerMessageNeedsSettingsProposal("Keep me updated daily on Acme stock")).toBe(true);
  });

  it("detects settings-assent", () => {
    expect(
      ownerMessageNeedsSettingsProposal(
        "[settings-assent] Owner confirmed your offer. Emit settingsProposal.",
      ),
    ).toBe(true);
  });

  it("does not flag plain price questions", () => {
    expect(ownerMessageNeedsSettingsProposal("What's the XRP price?")).toBe(false);
    expect(ownerMessageNeedsSettingsProposal("Hi")).toBe(false);
    expect(ownerMessageNeedsSettingsProposal("What's on my calendar today?")).toBe(false);
  });

  it("detects settingsProposal in protocol JSON", () => {
    expect(protocolHasSettingsProposal('{"settingsProposal":true}')).toBe(true);
    expect(protocolHasSettingsProposal('{"settingsProposal":"true"}')).toBe(true);
    expect(protocolHasSettingsProposal('{"messages":[{"type":"text","text":"ok"}]}')).toBe(false);
    expect(
      protocolMessagesHaveSettingsProposal([
        { type: "text", text: "ok" },
        {
          type: "consequential-action",
          action: { terms: { settingsProposal: true } },
        },
      ]),
    ).toBe(true);
  });

  it("repair content carries the tag", () => {
    expect(softConfirmRepairUserContent()).toContain(SOFT_CONFIRM_REPAIR_TAG);
    expect(softConfirmRepairUserContent()).toContain("settingsProposal");
  });
});
