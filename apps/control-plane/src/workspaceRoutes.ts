import type { Express, Request, Response } from "express";
import { newAgentId } from "./fleet/index.js";
import type { FleetProvisioner, HostedAgentRecord } from "./fleet/types.js";
import { parseSignupHandle, publicHandle } from "./handles.js";
import { isSupabaseConfigured, supabaseAdmin } from "./supabaseAdmin.js";
import { verifySupabaseAccessToken } from "./supabaseAuth.js";

type WorkspaceKind = "personal" | "business" | "developer";

export interface WorkspaceRouteDeps {
  fleet: () => FleetProvisioner | null;
  fleetAgents: () => Map<string, HostedAgentRecord>;
  persistAgents: () => Promise<void>;
}

async function requireUser(req: Request, res: Response) {
  const user = await verifySupabaseAccessToken(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  return user;
}

function publicProvisionError(message: string): string {
  if (/command failed:\s*docker|docker run/i.test(message)) {
    return "Could not start your hosted agent. Check that Docker is running on the control plane host.";
  }
  return message;
}

/** Ensure the auth user has a personal workspace; return its id. */
export async function ensurePersonalWorkspaceId(userId: string, label = "Personal"): Promise<string> {
  const { data: existing } = await supabaseAdmin()
    .from("workspaces")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("kind", "personal")
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabaseAdmin()
    .from("workspaces")
    .insert({
      owner_user_id: userId,
      kind: "personal" satisfies WorkspaceKind,
      label,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function isHandleTaken(handle: string, exceptUserId?: string): Promise<boolean> {
  const { data: profileHit, error: profileError } = await supabaseAdmin()
    .from("profiles")
    .select("id")
    .eq("handle", handle)
    .limit(1);
  if (profileError) throw new Error(profileError.message);
  if ((profileHit?.length ?? 0) > 0) {
    if (!exceptUserId || profileHit![0]!.id !== exceptUserId) return true;
  }
  const { data: agentHit, error: agentError } = await supabaseAdmin()
    .from("hosted_agents")
    .select("id, user_id")
    .eq("handle", handle)
    .limit(1);
  if (agentError) throw new Error(agentError.message);
  if ((agentHit?.length ?? 0) === 0) return false;
  if (exceptUserId && agentHit![0]!.user_id === exceptUserId) return false;
  return true;
}

async function loadLlmApiKey(userId: string): Promise<string | undefined> {
  const { data, error } = await supabaseAdmin()
    .from("user_llm_settings")
    .select("api_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.api_key?.trim() || undefined;
}

/** Provision a fleet agent for a workspace and persist hosted_agents + secrets. */
export async function provisionWorkspaceAgent(
  deps: WorkspaceRouteDeps,
  input: {
    userId: string;
    email: string;
    workspaceId: string;
    workspaceKind: WorkspaceKind;
    handle: string;
    llmApiKey?: string;
  },
): Promise<{ agentUrl: string; adminToken: string; handle: string }> {
  const fleet = deps.fleet();
  if (!fleet) throw new Error("Control plane starting");

  const agentId = newAgentId();
  const { data: row, error: insertError } = await supabaseAdmin()
    .from("hosted_agents")
    .insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      control_plane_agent_id: agentId,
      handle: input.handle,
      status: "provisioning",
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  try {
    const outcome = await fleet.provision({
      id: agentId,
      handle: input.handle,
      email: input.email,
      llmApiKey: input.llmApiKey,
      workspaceKind: input.workspaceKind,
    });
    deps.fleetAgents().set(outcome.agent.id, outcome.agent);
    await deps.persistAgents();

    const { error: updateError } = await supabaseAdmin()
      .from("hosted_agents")
      .update({
        control_plane_agent_id: outcome.agent.id,
        handle: outcome.agent.handle,
        agent_url: outcome.agent.agentUrl,
        status: "active",
        status_message: outcome.message ?? null,
      })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    const { error: secretError } = await supabaseAdmin().from("hosted_agent_secrets").upsert(
      {
        hosted_agent_id: row.id,
        user_id: input.userId,
        admin_token: outcome.agent.adminToken,
      },
      { onConflict: "hosted_agent_id" },
    );
    if (secretError) throw new Error(secretError.message);

    return {
      agentUrl: outcome.agent.agentUrl.replace(/\/$/, ""),
      adminToken: outcome.agent.adminToken,
      handle: publicHandle(outcome.agent.handle),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin()
      .from("hosted_agents")
      .update({ status: "failed", status_message: message })
      .eq("id", row.id);
    throw error;
  }
}

export function registerWorkspaceRoutes(app: Express, deps: WorkspaceRouteDeps): void {
  app.get("/workspaces", async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Workspace service not configured" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { data, error } = await supabaseAdmin()
        .from("workspaces")
        .select("id, kind, label, handle, business_domain, created_at")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      res.json({
        workspaces: (data ?? []).map((row) => ({
          id: row.id,
          kind: row.kind,
          label: row.label,
          handle: row.handle ?? undefined,
          businessDomain: row.business_domain ?? undefined,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/workspaces", async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Workspace service not configured" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    const body = req.body as {
      kind?: WorkspaceKind;
      label?: string;
      handle?: string;
      businessDomain?: string;
      provisionAgent?: boolean;
    };
    const kind = body.kind;
    if (kind !== "business" && kind !== "developer") {
      res.status(400).json({ error: "kind must be business or developer" });
      return;
    }
    const label = body.label?.trim() || (kind === "business" ? "Business" : "Developer");
    const parsed = parseSignupHandle({
      email: user.email,
      handle: body.handle,
    });
    if (parsed.error) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      if (await isHandleTaken(parsed.handle, user.id)) {
        res.status(409).json({ error: "Handle already taken" });
        return;
      }
      const { data, error } = await supabaseAdmin()
        .from("workspaces")
        .insert({
          owner_user_id: user.id,
          kind,
          label,
          handle: parsed.handle,
          business_domain: body.businessDomain?.trim() || null,
        })
        .select("id, kind, label, handle, business_domain, created_at")
        .single();
      if (error) throw new Error(error.message);

      let agent:
        | { agentUrl: string; adminToken: string; handle: string; status: string }
        | undefined;
      const shouldProvision = body.provisionAgent !== false;
      if (shouldProvision) {
        try {
          const llmApiKey = await loadLlmApiKey(user.id);
          const provisioned = await provisionWorkspaceAgent(deps, {
            userId: user.id,
            email: user.email ?? "",
            workspaceId: data.id,
            workspaceKind: kind,
            handle: parsed.handle,
            llmApiKey,
          });
          agent = { ...provisioned, status: "active" };
        } catch (provisionError) {
          const message =
            provisionError instanceof Error ? provisionError.message : String(provisionError);
          agent = {
            agentUrl: "",
            adminToken: "",
            handle: publicHandle(parsed.handle),
            status: `failed:${publicProvisionError(message)}`,
          };
        }
      }

      res.status(201).json({
        workspace: {
          id: data.id,
          kind: data.kind,
          label: data.label,
          handle: data.handle ?? undefined,
          businessDomain: data.business_domain ?? undefined,
          createdAt: data.created_at,
        },
        agent,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/workspaces/bootstrap", async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Workspace service not configured" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      const { data: existing } = await supabaseAdmin()
        .from("workspaces")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("kind", "personal")
        .maybeSingle();
      if (existing?.id) {
        res.json({ workspaceId: existing.id, created: false });
        return;
      }
      const workspaceId = await ensurePersonalWorkspaceId(user.id);
      res.json({ workspaceId, created: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  /** Connect shell to the hosted agent for a workspace (falls back to personal). */
  app.post("/workspaces/:workspaceId/connect", async (req, res) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({ error: "Workspace service not configured" });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    const workspaceId = String(req.params.workspaceId ?? "").trim();
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    try {
      const { data: workspace, error: wsError } = await supabaseAdmin()
        .from("workspaces")
        .select("id")
        .eq("id", workspaceId)
        .eq("owner_user_id", user.id)
        .maybeSingle();
      if (wsError) throw new Error(wsError.message);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      const { data: agent, error: agentError } = await supabaseAdmin()
        .from("hosted_agents")
        .select("id, handle, agent_url, status")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (agentError) throw new Error(agentError.message);
      if (!agent?.agent_url || agent.status !== "active") {
        res.status(409).json({ error: "Hosted agent not ready for this workspace" });
        return;
      }
      const { data: secret, error: secretError } = await supabaseAdmin()
        .from("hosted_agent_secrets")
        .select("admin_token")
        .eq("hosted_agent_id", agent.id)
        .maybeSingle();
      if (secretError) throw new Error(secretError.message);
      const adminToken = secret?.admin_token?.trim();
      if (!adminToken) {
        res.status(500).json({ error: "Agent credentials missing" });
        return;
      }
      res.json({
        agentUrl: agent.agent_url.replace(/\/$/, ""),
        adminToken,
        handle: publicHandle(agent.handle),
        workspaceId,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
