import { describe, expect, it } from "vitest";
import { createMemorySecretStore } from "./memorySecretStore.js";
import {
  DEFAULT_GOOGLE_CALENDAR_OAUTH_REF,
  isOAuthConnectionReady,
  resolveOAuthToken,
  upsertOAuthConnection,
} from "./oauthConnection.js";

describe("oauthConnection", () => {
  it("resolves token from SecretStore ref", () => {
    const store = createMemorySecretStore({ [DEFAULT_GOOGLE_CALENDAR_OAUTH_REF]: "tok_abc" });
    const config = {
      provider: "google",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      secretRef: DEFAULT_GOOGLE_CALENDAR_OAUTH_REF,
    };
    expect(isOAuthConnectionReady(config, store)).toBe(true);
    expect(resolveOAuthToken(config, store)).toBe("tok_abc");
  });

  it("persists connection metadata without token", () => {
    const config = {
      provider: "google",
      scopes: ["calendar"],
      secretRef: "atom.oauth.test",
      label: "Google Calendar",
    };
    const list = upsertOAuthConnection(config);
    expect(list.some((c) => c.secretRef === "atom.oauth.test")).toBe(true);
  });
});
