import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectorVault } from "./connectorVault.js";
import { codeChallengeS256, generateCodeVerifier, generateOAuthState } from "./oauthPkce.js";
import {
  ATOM_MICROSOFT_CLIENT_ID,
  beginMicrosoftOAuth,
  clearMicrosoftOAuthPendingForTests,
  microsoftAuthorizeUrl,
  microsoftRedirectUri,
  MICROSOFT_GRAPH_NOT_CONFIGURED_MESSAGE,
  resolveMicrosoftClient,
} from "./microsoftOAuth.js";

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
    expect(url).toContain("Calendars.ReadWrite");
  });
});

describe("resolveMicrosoftClient", () => {
  const originalClientId = process.env.MICROSOFT_CLIENT_ID;

  afterEach(() => {
    clearMicrosoftOAuthPendingForTests();
    if (originalClientId === undefined) delete process.env.MICROSOFT_CLIENT_ID;
    else process.env.MICROSOFT_CLIENT_ID = originalClientId;
  });

  it("treats the Atom placeholder client ID as not configured", async () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    const dir = mkdtempSync(path.join(tmpdir(), "atom-ms-oauth-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    expect(() => resolveMicrosoftClient(vault)).toThrow(MICROSOFT_GRAPH_NOT_CONFIGURED_MESSAGE);
    expect(() => beginMicrosoftOAuth(vault, "http://127.0.0.1:5204")).toThrow(
      MICROSOFT_GRAPH_NOT_CONFIGURED_MESSAGE,
    );
  });

  it("does not build an authorize URL when only the placeholder client ID is available", async () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    const dir = mkdtempSync(path.join(tmpdir(), "atom-ms-oauth-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    let authorizeUrl: string | undefined;
    try {
      ({ authorizeUrl } = beginMicrosoftOAuth(vault, "http://127.0.0.1:5204"));
    } catch {
      /* expected */
    }
    expect(authorizeUrl).toBeUndefined();
    expect(ATOM_MICROSOFT_CLIENT_ID).toBe("c673f99b-adad-4f64-a983-c21f10f8aa52");
  });

  it("uses MICROSOFT_CLIENT_ID env before the Atom default", async () => {
    process.env.MICROSOFT_CLIENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const dir = mkdtempSync(path.join(tmpdir(), "atom-ms-oauth-env-"));
    const vault = new ConnectorVault(
      path.join(dir, "vault-master.key"),
      path.join(dir, "vault.enc"),
    );
    await vault.load();
    const { clientId } = resolveMicrosoftClient(vault);
    expect(clientId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const started = beginMicrosoftOAuth(vault, "http://127.0.0.1:5204");
    expect(started.authorizeUrl).toContain("client_id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });
});
