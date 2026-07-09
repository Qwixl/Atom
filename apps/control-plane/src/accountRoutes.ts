import type { Express, Request, Response } from "express";
import type { FleetProvisioner } from "./fleet/types.js";
import { parseSignupHandle, publicHandle } from "./handles.js";
import { isSupabaseConfigured, supabaseAdmin } from "./supabaseAdmin.js";
import { verifySupabaseAccessToken } from "./supabaseAuth.js";
import type { HostedAgentRecord } from "./fleet/types.js";
import { ensurePersonalWorkspaceId, provisionWorkspaceAgent } from "./workspaceRoutes.js";

type AccountType = "user" | "business" | "developer";

function publicProvisionError(message: string): string {
  if (/command failed:\s*docker|docker run/i.test(message)) {
    return "Could not start your hosted agent. Check that Docker is running on the control plane host.";
  }
  return message;
}

interface BootstrapBody {
  handle?: string;
  accountType?: AccountType;
  llmApiKey?: string;
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

async function requireUser(req: Request, res: Response) {
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
    .select("id, handle, agent_url, status, status_message, control_plane_agent_id, workspace_id")
    .eq("user_id", userId)
    .eq("workspace_id", personalWorkspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;
  // Pre-migration fallback: one agent per user without workspace_id match
  const { data: legacy, error: legacyError } = await supabaseAdmin()
    .from("hosted_agents")
    .select("id, handle, agent_url, status, status_message, control_plane_agent_id, workspace_id")
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

async function isHandleTakenInSupabase(handle: string, exceptUserId?: string): Promise<boolean> {
  let query = supabaseAdmin().from("profiles").select("id").eq("handle", handle);
  if (exceptUserId) query = query.neq("id", exceptUserId);
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export function registerAccountRoutes(
  app: Express,
  deps: {
    fleet: () => FleetProvisioner | null;
    fleetAgents: () => Map<string, HostedAgentRecord>;
    persistAgents: () => Promise<void>;
  },
): void {
  app.get("/account/status", async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Account service not configured" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const [{ data: profile }, agent] = await Promise.all([
        supabaseAdmin().from("profiles").select("*").eq("id", user.id).single(),
        loadPersonalHostedAgent(user.id),
      ]);
      res.json({
        profile: profile
          ? {
              email: profile.email,
              handle: profile.handle ? publicHandle(profile.handle) : undefined,
              accountType: profile.account_type,
              onboardingComplete: profile.onboarding_complete,
            }
          : { email: user.email },
        agent: agent
          ? {
              status: agent.status,
              handle: publicHandle(agent.handle),
              agentUrl: agent.agent_url ?? undefined,
              message: agent.status_message ?? undefined,
            }
          : undefined,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/account/bootstrap", async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Account service not configured" });
      return;
    }
    const fleet = deps.fleet();
    if (!fleet) {
      res.status(503).json({ error: "Control plane starting" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;

    const body = req.body as BootstrapBody;
    const parsedHandle = parseSignupHandle({ email: user.email, handle: body.handle });
    if (parsedHandle.error) {
      res.status(400).json({ error: parsedHandle.error });
      return;
    }

    const accountType: AccountType =
      body.accountType === "business" || body.accountType === "developer"
        ? body.accountType
        : "user";

    try {
      if (await isHandleTakenInSupabase(parsedHandle.handle, user.id)) {
        res.status(409).json({ error: "That handle is already taken." });
        return;
      }

      const { error: profileError } = await supabaseAdmin()
        .from("profiles")
        .update({
          handle: parsedHandle.handle,
          account_type: accountType,
          email: user.email,
        })
        .eq("id", user.id);
      if (profileError) throw new Error(profileError.message);

      const llmKey = body.llmApiKey?.trim();
      if (llmKey) {
        const { error: llmError } = await supabaseAdmin().from("user_llm_settings").upsert(
          {
            user_id: user.id,
            provider: body.llmProvider?.trim() || "openai",
            api_key: llmKey,
            base_url: body.llmBaseUrl?.trim() || null,
            model: body.llmModel?.trim() || null,
          },
          { onConflict: "user_id" },
        );
        if (llmError) throw new Error(llmError.message);
      }

      const existing = await loadPersonalHostedAgent(user.id);
      if (existing?.status === "active" && existing.agent_url) {
        await supabaseAdmin()
          .from("profiles")
          .update({ onboarding_complete: true })
          .eq("id", user.id);
        res.json({
          status: "ready",
          handle: publicHandle(existing.handle),
          agentUrl: existing.agent_url,
        });
        return;
      }

      const personalWorkspaceId = await ensurePersonalWorkspaceId(user.id);
      if (accountType === "business") {
        const { data: businessWs } = await supabaseAdmin()
          .from("workspaces")
          .select("id")
          .eq("owner_user_id", user.id)
          .eq("kind", "business")
          .maybeSingle();
        if (!businessWs?.id) {
          await supabaseAdmin().from("workspaces").insert({
            owner_user_id: user.id,
            kind: "business",
            label: "Business",
            handle: parsedHandle.handle,
          });
        }
      }

      const provisioned = await provisionWorkspaceAgent(deps, {
        userId: user.id,
        email: user.email ?? "",
        workspaceId: personalWorkspaceId,
        workspaceKind: "personal",
        handle: parsedHandle.handle,
        llmApiKey: llmKey || undefined,
      });

      await supabaseAdmin()
        .from("profiles")
        .update({ onboarding_complete: true })
        .eq("id", user.id);

      res.json({
        status: "ready",
        handle: provisioned.handle,
        agentUrl: provisioned.agentUrl,
        custodyNotice:
          "A hosted agent means Qwixl infrastructure holds your keys and store. You can export and self-host at any time.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const personalWorkspaceId = await ensurePersonalWorkspaceId(user.id);
        await supabaseAdmin()
          .from("hosted_agents")
          .update({ status: "failed", status_message: message })
          .eq("user_id", user.id)
          .eq("workspace_id", personalWorkspaceId);
      } catch {
        /* best effort */
      }
      res.status(500).json({ error: publicProvisionError(message) });
    }
  });

  app.post("/account/connect", async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Account service not configured" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
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
      res.json({
        agentUrl: agent.agent_url.replace(/\/$/, ""),
        adminToken,
        handle: publicHandle(agent.handle),
        workspaceId: agent.workspace_id ?? undefined,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/account/llm-key", async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Account service not configured" });
      return;
    }
    const fleet = deps.fleet();
    if (!fleet) {
      res.status(503).json({ error: "Control plane starting" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;

    const body = req.body as { llmApiKey?: string; llmProvider?: string };
    const llmKey = body.llmApiKey?.trim();
    if (!llmKey) {
      res.status(400).json({ error: "LLM API key is required" });
      return;
    }
    const provider = body.llmProvider?.trim() || "openai";

    try {
      const hosted = await loadPersonalHostedAgent(user.id);
      if (!hosted?.control_plane_agent_id || hosted.status !== "active") {
        res.status(409).json({ error: "Hosted agent not ready" });
        return;
      }

      const { error: llmError } = await supabaseAdmin().from("user_llm_settings").upsert(
        {
          user_id: user.id,
          provider,
          api_key: llmKey,
        },
        { onConflict: "user_id" },
      );
      if (llmError) throw new Error(llmError.message);

      const fleetAgent = deps.fleetAgents().get(hosted.control_plane_agent_id);
      if (!fleetAgent) {
        res.status(404).json({ error: "Hosted agent record not found on fleet host" });
        return;
      }

      await fleet.updateLlmApiKey(fleetAgent, llmKey);
      await deps.persistAgents();

      res.json({ status: "updated" });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
