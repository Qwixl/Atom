import { describe, expect, it } from "vitest";
import {
  isTransitionalPortHostname,
  normalizeAgentHandle,
  resolvePublicBaseUrl,
} from "./publicIdentity.js";

describe("publicIdentity", () => {
  it("normalizes handles", () => {
    expect(normalizeAgentHandle("@Mira")).toBe("mira");
  });

  it("prefers handle template", () => {
    expect(
      resolvePublicBaseUrl({
        template: "https://{handle}.agents.atom.qwixl.com",
        handle: "@mira",
        port: 5401,
      }),
    ).toBe("https://mira.agents.atom.qwixl.com");
  });

  it("supports transitional port template", () => {
    expect(
      resolvePublicBaseUrl({
        template: "https://{port}.agents.atom.qwixl.com",
        handle: "mira",
        port: 5401,
      }),
    ).toBe("https://5401.agents.atom.qwixl.com");
  });

  it("detects port hostnames", () => {
    expect(isTransitionalPortHostname("https://5401.agents.atom.qwixl.com")).toBe(true);
    expect(isTransitionalPortHostname("https://mira.agents.atom.qwixl.com")).toBe(false);
  });
});
