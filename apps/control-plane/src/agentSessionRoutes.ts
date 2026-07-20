import type { Express } from "express";
import { isSupabaseConfigured } from "./supabaseAdmin.js";
import { verifySupabaseAccessToken } from "./supabaseAuth.js";
import { createRateLimiter } from "./rateLimit.js";
import { ensurePersonalWorkspaceId } from "./workspaceRoutes.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import {
  ALLOWED_SESSION_SCOPES,
  HOSTED_OWNER_SESSION_SCOPES,
  mintHostedOwnerSession,
} from "./hostedSessionMint.js";

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

/**
 * Mint a short-lived agent session using the server-held admin token.
 * Browser never receives the root bearer (M21.4 / AS-09).
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
    const scopes = (body.scopes ?? [...HOSTED_OWNER_SESSION_SCOPES]).filter((s) =>
      ALLOWED_SESSION_SCOPES.has(s),
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
      const minted = await mintHostedOwnerSession({
        userId: user.id,
        hostedAgentId: agent.id,
        agentUrl: agent.agent_url,
        handle: agent.handle,
        workspaceId: agent.workspace_id,
        scopes,
        ttlSeconds: typeof body.ttlSeconds === "number" ? body.ttlSeconds : 900,
      });
      res.json(minted);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("session mint failed")) {
        res.status(502).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
