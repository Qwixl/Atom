import type { Express, Request, Response } from "express";
import type { FleetProvisioner } from "./fleet/types.js";
import { newAgentId } from "./fleet/index.js";
import { parseSignupHandle, publicHandle } from "./handles.js";
import { isSupabaseConfigured, supabaseAdmin } from "./supabaseAdmin.js";
import { verifySupabaseAccessToken } from "./supabaseAuth.js";
import type { HostedAgentRecord } from "./fleet/types.js";

type AccountType = "user" | "business" | "developer";

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

async function loadHostedAgent(userId: string) {
  const { data, error } = await supabaseAdmin()
    .from("hosted_agents")
    .select("id, handle, agent_url, status, status_message")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function loadAdminToken(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("hosted_agent_secrets")
    .select("admin_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.admin_token?.trim() || null;
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
        loadHostedAgent(user.id),
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

      const existing = await loadHostedAgent(user.id);
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

      const agentId = newAgentId();
      await supabaseAdmin().from("hosted_agents").upsert(
        {
          user_id: user.id,
          control_plane_agent_id: agentId,
          handle: parsedHandle.handle,
          status: "provisioning",
        },
        { onConflict: "user_id" },
      );

      const outcome = await fleet.provision({
        id: agentId,
        handle: parsedHandle.handle,
        email: user.email,
        llmApiKey: llmKey || undefined,
      });

      deps.fleetAgents().set(outcome.agent.id, outcome.agent);
      await deps.persistAgents();

      const { error: agentError } = await supabaseAdmin()
        .from("hosted_agents")
        .update({
          control_plane_agent_id: outcome.agent.id,
          handle: outcome.agent.handle,
          agent_url: outcome.agent.agentUrl,
          status: "active",
          status_message: outcome.message ?? null,
        })
        .eq("user_id", user.id);
      if (agentError) throw new Error(agentError.message);

      const { error: secretError } = await supabaseAdmin().from("hosted_agent_secrets").upsert(
        {
          user_id: user.id,
          admin_token: outcome.agent.adminToken,
        },
        { onConflict: "user_id" },
      );
      if (secretError) throw new Error(secretError.message);

      await supabaseAdmin()
        .from("profiles")
        .update({ onboarding_complete: true })
        .eq("id", user.id);

      res.json({
        status: "ready",
        handle: publicHandle(outcome.agent.handle),
        agentUrl: outcome.agent.agentUrl,
        custodyNotice:
          "A hosted agent means Qwixl infrastructure holds your keys and store. You can export and self-host at any time.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await supabaseAdmin()
          .from("hosted_agents")
          .update({ status: "failed", status_message: message })
          .eq("user_id", user.id);
      } catch {
        /* best effort */
      }
      res.status(500).json({ error: message });
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
      const agent = await loadHostedAgent(user.id);
      if (!agent?.agent_url || agent.status !== "active") {
        res.status(409).json({ error: "Hosted agent not ready. Complete signup first." });
        return;
      }
      const adminToken = await loadAdminToken(user.id);
      if (!adminToken) {
        res.status(500).json({ error: "Agent credentials missing" });
        return;
      }
      res.json({
        agentUrl: agent.agent_url.replace(/\/$/, ""),
        adminToken,
        handle: publicHandle(agent.handle),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
