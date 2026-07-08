import { describe, expect, it } from "vitest";
import { mintSessionToken, verifySessionToken } from "./sessionToken.js";

describe("sessionToken", () => {
  const secret = "test-admin-secret";

  it("mints and verifies a connector read token", () => {
    const token = mintSessionToken(secret, { scopes: ["connector:read"], ttlMs: 60_000 });
    const payload = verifySessionToken(secret, token);
    expect(payload?.scopes).toEqual(["connector:read"]);
    expect(payload?.exp).toBeGreaterThan(Date.now());
  });

  it("rejects tampered tokens", () => {
    const token = mintSessionToken(secret, { scopes: ["connector:read"] });
    expect(verifySessionToken(secret, `${token}x`)).toBeNull();
    expect(verifySessionToken("other-secret", token)).toBeNull();
  });
});
