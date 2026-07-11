import { CONTROL_PLANE_URL, usesSupabaseHostedAuth } from "../hostConfig.js";
import { supabaseAccessToken } from "../auth/hostedAccount.js";

const DEFAULT_SCOPES = ["connector:read", "chat:agui"] as const;

/**
 * Mint a short-lived agent session via the control plane (hosted only).
 * Uses the server-held admin token — browser never presents root bearer to the agent (M21.4 / AS-09).
 */
export async function mintHostedAgentSession(options?: {
  scopes?: string[];
  ttlSeconds?: number;
}): Promise<string | null> {
  if (!usesSupabaseHostedAuth()) return null;
  const accessToken = await supabaseAccessToken();
  if (!accessToken) return null;

  const resp = await fetch(`${CONTROL_PLANE_URL.replace(/\/$/, "")}/account/agent-session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scopes: options?.scopes ?? [...DEFAULT_SCOPES],
      ttlSeconds: options?.ttlSeconds ?? 900,
    }),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { sessionToken?: string };
  return body.sessionToken?.trim() || null;
}
