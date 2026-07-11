import { publicHandle } from "./handles.js";
import { supabaseAdmin } from "./supabaseAdmin.js";

export const HOSTED_OWNER_SESSION_SCOPES = [
  "owner:runtime",
  "connector:read",
  "chat:agui",
] as const;

export const ALLOWED_SESSION_SCOPES = new Set<string>(HOSTED_OWNER_SESSION_SCOPES);

export async function loadAdminTokenForAgent(
  hostedAgentId: string,
  userId: string,
): Promise<string | null> {
  const byAgent = await supabaseAdmin()
    .from("hosted_agent_secrets")
    .select("admin_token")
    .eq("hosted_agent_id", hostedAgentId)
    .maybeSingle();
  if (!byAgent.error && byAgent.data?.admin_token?.trim()) {
    return byAgent.data.admin_token.trim();
  }
  const byUser = await supabaseAdmin()
    .from("hosted_agent_secrets")
    .select("admin_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (byUser.error) throw new Error(byUser.error.message);
  return byUser.data?.admin_token?.trim() || null;
}

export type MintedHostedSession = {
  agentUrl: string;
  sessionToken: string;
  scopes: string[];
  expiresInSeconds: number;
  handle: string;
  workspaceId?: string;
};

/** Mint a short-lived owner session using the server-held admin token (never returned to browser). */
export async function mintHostedOwnerSession(input: {
  userId: string;
  hostedAgentId: string;
  agentUrl: string;
  handle: string;
  workspaceId?: string | null;
  scopes?: string[];
  ttlSeconds?: number;
  adminToken?: string;
}): Promise<MintedHostedSession> {
  const adminToken =
    input.adminToken?.trim() || (await loadAdminTokenForAgent(input.hostedAgentId, input.userId));
  if (!adminToken) {
    throw new Error("Agent credentials missing");
  }

  const scopes = (input.scopes?.length ? input.scopes : [...HOSTED_OWNER_SESSION_SCOPES]).filter(
    (s) => ALLOWED_SESSION_SCOPES.has(s),
  );
  if (scopes.length === 0) {
    throw new Error("At least one valid session scope is required");
  }

  const agentUrl = input.agentUrl.replace(/\/$/, "");
  const resp = await fetch(`${agentUrl}/admin/session-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scopes,
      ttlSeconds: typeof input.ttlSeconds === "number" ? input.ttlSeconds : 900,
    }),
  });
  const data = (await resp.json()) as {
    token?: string;
    scopes?: string[];
    expiresInSeconds?: number;
    error?: string;
  };
  if (!resp.ok || !data.token?.trim()) {
    throw new Error(data.error ?? `Agent session mint failed (${resp.status})`);
  }

  return {
    agentUrl,
    sessionToken: data.token.trim(),
    scopes: data.scopes ?? scopes,
    expiresInSeconds: data.expiresInSeconds ?? 900,
    handle: publicHandle(input.handle),
    workspaceId: input.workspaceId ?? undefined,
  };
}
