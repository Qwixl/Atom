import type { Express } from "express";
import { publicHandle } from "./handles.js";
import { isSupabaseConfigured, supabaseAdmin } from "./supabaseAdmin.js";
import { verifySupabaseAccessToken } from "./supabaseAuth.js";
import { ensurePersonalWorkspaceId } from "./workspaceRoutes.js";
import { createRateLimiter } from "./rateLimit.js";

async function requireUser(req: Parameters<typeof verifySupabaseAccessToken>[0], res: {
  status: (code: number) => { json: (body: unknown) => void };
}) {
  const user = await verifySupabaseAccessToken(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  return user;
}

async function loadPersonalHostedAgent(userId: string) {
  const personalWorkspaceId = await ensurePersonalWorkspaceId(userId);
  const { data, error } = await supabaseAdmin()
    .from("hosted_agents")
    .select("id, handle, agent_url, status, control_plane_agent_id, workspace_id")
    .eq("user_id", userId)
    .eq("workspace_id", personalWorkspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  const { data: legacy, error: legacyError } = await supabaseAdmin()
    .from("hosted_agents")
    .select("id, handle, agent_url, status, control_plane_agent_id, workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (legacyError) throw new Error(legacyError.message);
  return legacy;
}

async function loadAdminTokenForAgent(
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

const ALLOWED_SCOPES = new Set(["connector:read", "chat:agui"]);

/**
 * Mint a short-lived agent session using the server-held admin token.
 * Browser never needs the root bearer for Chat / connector reads (M21.4 / AS-09).
 */
export function registerAgentSessionRoutes(app: Express): void {
  const sessionRateLimit = createRateLimiter(60 * 1000, 30);

  app.post("/account/agent-session", sessionRateLimit, async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Account service not configured" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;

    const body = req.body as { scopes?: string[]; ttlSeconds?: number };
    const scopes = (body.scopes ?? ["connector:read", "chat:agui"]).filter((s) =>
      ALLOWED_SCOPES.has(s),
    );
    if (scopes.length === 0) {
      res.status(400).json({ error: "At least one valid session scope is required" });
      return;
    }

    try {
      const agent = await loadPersonalHostedAgent(user.id);
      if (!agent?.agent_url || agent.status !== "active") {
        res.status(409).json({ error: "Hosted agent not ready. Complete signup first." });
        return;
      }
      const adminToken = await loadAdminTokenForAgent(agent.id, user.id);
      if (!adminToken) {
        res.status(500).json({ error: "Agent credentials missing" });
        return;
      }

      const agentUrl = agent.agent_url.replace(/\/$/, "");
      const resp = await fetch(`${agentUrl}/admin/session-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scopes,
          ttlSeconds: typeof body.ttlSeconds === "number" ? body.ttlSeconds : 900,
        }),
      });
      const data = (await resp.json()) as {
        token?: string;
        scopes?: string[];
        expiresInSeconds?: number;
        error?: string;
      };
      if (!resp.ok || !data.token?.trim()) {
        res.status(502).json({
          error: data.error ?? `Agent session mint failed (${resp.status})`,
        });
        return;
      }

      res.json({
        agentUrl,
        sessionToken: data.token.trim(),
        scopes: data.scopes ?? scopes,
        expiresInSeconds: data.expiresInSeconds ?? 900,
        handle: publicHandle(agent.handle),
        workspaceId: agent.workspace_id ?? undefined,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
