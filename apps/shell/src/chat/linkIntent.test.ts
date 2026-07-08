import { describe, expect, it } from "vitest";
import {
  buildLinkIntentMessage,
  friendlyLinkIntentLabel,
  isContentHttpsLink,
  isLinkIntentProtocolMessage,
  isShellOutboundLink,
} from "./linkIntent.js";

describe("linkIntent", () => {
  it("builds structured link-intent message", () => {
    const message = buildLinkIntentMessage({
      url: "https://example.com/story",
      title: "Example story",
      intent: "summarize",
    });
    expect(message).toMatch(/^\[link-intent\]/);
    expect(JSON.parse(message.slice("[link-intent] ".length))).toEqual({
      url: "https://example.com/story",
      title: "Example story",
      intent: "summarize",
    });
  });

  it("rejects non-https URLs", () => {
    expect(() =>
      buildLinkIntentMessage({ url: "http://example.com", title: "x", intent: "explore" }),
    ).toThrow();
  });

  it("friendly label uses intent name and title", () => {
    expect(
      friendlyLinkIntentLabel({
        url: "https://example.com/a",
        title: "Headline",
        intent: "full",
      }),
    ).toBe("In-Full: Headline");
  });

  it("detects protocol messages", () => {
    expect(isLinkIntentProtocolMessage('[link-intent] {"url":"https://x"}')).toBe(true);
    expect(isLinkIntentProtocolMessage("Summarise: foo")).toBe(false);
  });

  it("treats calendar links as shell outbound", () => {
    expect(isShellOutboundLink("https://calendar.google.com/calendar/render?action=TEMPLATE")).toBe(
      true,
    );
    expect(isContentHttpsLink("https://calendar.google.com/foo")).toBe(false);
    expect(isContentHttpsLink("https://news.example.com/article")).toBe(true);
  });
});
