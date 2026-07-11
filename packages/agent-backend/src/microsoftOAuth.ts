import type { ConnectorVault, StoredOAuthTokens } from "./connectorVault.js";
import { codeChallengeS256, generateCodeVerifier, generateOAuthState } from "./oauthPkce.js";

/** Vault OAuth provider key (tokens + optional client credentials). */
export const MICROSOFT_OAUTH_PROVIDER = "microsoft";

/** Connector id for invoke / registry (docs: microsoft-graph). */
export const MICROSOFT_GRAPH_CONNECTOR_ID = "microsoft-graph";

export const MICROSOFT_GRAPH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "Calendars.Read",
] as const;

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface PendingAuth {
  codeVerifier: string;
  createdAt: number;
  redirectUri: string;
}

/** In-memory PKCE state (per agent process). TTL 15 minutes. */
const pendingByState = new Map<string, PendingAuth>();
const PENDING_TTL_MS = 15 * 60 * 1000;

function prunePending(now = Date.now()): void {
  for (const [state, pending] of pendingByState) {
    if (now - pending.createdAt > PENDING_TTL_MS) pendingByState.delete(state);
  }
}

export function microsoftTenantId(): string {
  return process.env.MICROSOFT_TENANT?.trim() || "common";
}

export function resolveMicrosoftClient(vault: ConnectorVault): {
  clientId: string;
  clientSecret?: string;
} {
  const fromVault = vault.getOAuthClient(MICROSOFT_OAUTH_PROVIDER);
  const clientId =
    fromVault?.clientId?.trim() || process.env.MICROSOFT_CLIENT_ID?.trim() || "";
  const clientSecret =
    fromVault?.clientSecret?.trim() || process.env.MICROSOFT_CLIENT_SECRET?.trim() || undefined;
  if (!clientId) {
    throw new Error(
      "Microsoft Graph not configured — set MICROSOFT_CLIENT_ID (or vault oauth client) first",
    );
  }
  return { clientId, clientSecret: clientSecret || undefined };
}

export function microsoftRedirectUri(publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/$/, "")}/connectors/microsoft/callback`;
}

export function microsoftAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: readonly string[];
  tenant?: string;
}): string {
  const tenant = input.tenant ?? microsoftTenantId();
  const scopes = (input.scopes ?? MICROSOFT_GRAPH_SCOPES).join(" ");
  const params = new URLSearchParams({
    client_id: input.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    response_mode: "query",
    scope: scopes,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params}`;
}

export function beginMicrosoftOAuth(vault: ConnectorVault, publicBaseUrl: string): {
  authorizeUrl: string;
  state: string;
  redirectUri: string;
} {
  prunePending();
  const { clientId } = resolveMicrosoftClient(vault);
  const redirectUri = microsoftRedirectUri(publicBaseUrl);
  const codeVerifier = generateCodeVerifier();
  const state = generateOAuthState();
  pendingByState.set(state, { codeVerifier, createdAt: Date.now(), redirectUri });
  const authorizeUrl = microsoftAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: codeChallengeS256(codeVerifier),
  });
  return { authorizeUrl, state, redirectUri };
}

async function tokenRequest(
  body: URLSearchParams,
  tenant = microsoftTenantId(),
): Promise<StoredOAuthTokens> {
  const resp = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const json = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!resp.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || `Microsoft token exchange failed (${resp.status})`,
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt:
      typeof json.expires_in === "number" ? Date.now() + json.expires_in * 1000 : undefined,
    scope: json.scope,
  };
}

export async function completeMicrosoftOAuth(
  vault: ConnectorVault,
  input: { code: string; state: string },
): Promise<StoredOAuthTokens> {
  prunePending();
  const pending = pendingByState.get(input.state);
  if (!pending) {
    throw new Error("Invalid or expired OAuth state — start connect again from Settings");
  }
  pendingByState.delete(input.state);
  const { clientId, clientSecret } = resolveMicrosoftClient(vault);
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: pending.redirectUri,
    code_verifier: pending.codeVerifier,
    scope: MICROSOFT_GRAPH_SCOPES.join(" "),
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  const tokens = await tokenRequest(body);
  await vault.setOAuth(MICROSOFT_OAUTH_PROVIDER, tokens);
  return tokens;
}

export async function refreshMicrosoftAccessToken(vault: ConnectorVault): Promise<StoredOAuthTokens> {
  const existing = vault.getOAuth(MICROSOFT_OAUTH_PROVIDER);
  if (!existing?.refreshToken) {
    throw new Error("Microsoft Graph not connected — connect in Settings → Connectors");
  }
  const { clientId, clientSecret } = resolveMicrosoftClient(vault);
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: existing.refreshToken,
    scope: MICROSOFT_GRAPH_SCOPES.join(" "),
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  const tokens = await tokenRequest(body);
  await vault.setOAuth(MICROSOFT_OAUTH_PROVIDER, {
    ...tokens,
    refreshToken: tokens.refreshToken ?? existing.refreshToken,
  });
  return vault.getOAuth(MICROSOFT_OAUTH_PROVIDER)!;
}

/** Return a usable access token, refreshing when near expiry. */
export async function getMicrosoftAccessToken(vault: ConnectorVault): Promise<string> {
  const stored = vault.getOAuth(MICROSOFT_OAUTH_PROVIDER);
  if (!stored?.accessToken) {
    throw new Error("Microsoft Graph not connected — connect in Settings → Connectors");
  }
  const skewMs = 60_000;
  if (stored.expiresAt && stored.expiresAt - skewMs > Date.now()) {
    return stored.accessToken;
  }
  if (stored.refreshToken) {
    const refreshed = await refreshMicrosoftAccessToken(vault);
    return refreshed.accessToken;
  }
  return stored.accessToken;
}

export async function revokeMicrosoftOAuth(vault: ConnectorVault): Promise<void> {
  const stored = vault.getOAuth(MICROSOFT_OAUTH_PROVIDER);
  await vault.clearOAuth(MICROSOFT_OAUTH_PROVIDER);
  // Best-effort: Microsoft does not always expose a simple revoke for SPA/public clients.
  if (stored?.refreshToken) {
    try {
      await fetch("https://graph.microsoft.com/v1.0/me/revokeSignInSessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${stored.accessToken}` },
      });
    } catch {
      /* ignore */
    }
  }
}

export function microsoftGraphApiBase(): string {
  return GRAPH_BASE;
}

/** Test helper — clear pending map. */
export function clearMicrosoftOAuthPendingForTests(): void {
  pendingByState.clear();
}
