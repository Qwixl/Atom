import { describe, expect, it } from "vitest";
import { codeChallengeS256, generateCodeVerifier, generateOAuthState } from "./oauthPkce.js";
import { microsoftAuthorizeUrl, microsoftRedirectUri } from "./microsoftOAuth.js";

describe("oauthPkce", () => {
  it("generates url-safe verifier and matching S256 challenge", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThan(40);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    const challenge = codeChallengeS256(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).not.toBe(verifier);
  });

  it("generates distinct states", () => {
    expect(generateOAuthState()).not.toBe(generateOAuthState());
  });
});

describe("microsoftOAuth urls", () => {
  it("builds redirect and authorize URLs", () => {
    expect(microsoftRedirectUri("http://127.0.0.1:5204")).toBe(
      "http://127.0.0.1:5204/connectors/microsoft/callback",
    );
    const url = microsoftAuthorizeUrl({
      clientId: "app-id",
      redirectUri: "http://127.0.0.1:5204/connectors/microsoft/callback",
      state: "st",
      codeChallenge: "ch",
      tenant: "common",
    });
    expect(url).toContain("login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(url).toContain("client_id=app-id");
    expect(url).toContain("code_challenge=ch");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("Calendars.Read");
  });
});
