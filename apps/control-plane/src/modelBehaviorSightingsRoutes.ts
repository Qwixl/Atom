/**
 * First-use model behavior sightings queue (control plane).
 * Hosted agents POST with ATOM_ADMIN_TOKEN; GHA fetches/acks with ATOM_PROVISION_SECRET.
 */
import type { Express, Request, Response } from "express";
import {
  isModelAssessed,
  parseModelIdentity,
  sightingMergeKey,
} from "@qwixl/agent-llm";
import { createRateLimiter } from "./rateLimit.js";
import { isSupabaseConfigured, supabaseAdmin } from "./supabaseAdmin.js";

const ingestRateLimit = createRateLimiter(60 * 1000, 20);
const opsRateLimit = createRateLimiter(60 * 1000, 30);

function looksLikeSecret(modelId: string): boolean {
  return /sk-[a-zA-Z0-9]|api[_-]?key|bearer\s/i.test(modelId);
}

async function resolveHostedAgentFromAdminToken(
  token: string,
): Promise<{ hostedAgentId: string } | null> {
  const byAgent = await supabaseAdmin()
    .from("hosted_agent_secrets")
    .select("hosted_agent_id, user_id")
    .eq("admin_token", token)
    .maybeSingle();
  if (byAgent.error) throw new Error(byAgent.error.message);
  if (byAgent.data?.hosted_agent_id) {
    return { hostedAgentId: byAgent.data.hosted_agent_id as string };
  }
  if (byAgent.data?.user_id) {
    const agent = await supabaseAdmin()
      .from("hosted_agents")
      .select("id")
      .eq("user_id", byAgent.data.user_id)
      .eq("status", "active")
      .maybeSingle();
    if (agent.error) throw new Error(agent.error.message);
    if (agent.data?.id) return { hostedAgentId: agent.data.id as string };
  }
  return null;
}

export function registerModelBehaviorSightingsRoutes(
  app: Express,
  deps: {
    requireProvisionAuth: (req: Request, res: Response) => boolean;
  },
): void {
  app.post("/model-behavior/sightings", ingestRateLimit, async (req, res) => {
    try {
      if (!isSupabaseConfigured()) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const agent = await resolveHostedAgentFromAdminToken(token);
      if (!agent) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const modelId = String(req.body?.modelId ?? "").trim();
      if (!modelId || modelId.length > 200 || looksLikeSecret(modelId)) {
        res.status(400).json({ error: "Invalid modelId" });
        return;
      }

      const mergeKey = sightingMergeKey(modelId);
      if (!mergeKey) {
        res.status(400).json({ error: "Invalid modelId" });
        return;
      }

      if (isModelAssessed(modelId)) {
        res.json({ ok: true, status: "skipped", reason: "already_assessed" });
        return;
      }

      const identity = parseModelIdentity(modelId);
      const preferredId = identity.providerPrefix
        ? `${identity.providerPrefix}/${identity.bare}`
        : modelId;

      const existing = await supabaseAdmin()
        .from("model_behavior_sightings")
        .select("id, status, model_id, report_count")
        .eq("merge_key", mergeKey)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);

      const now = new Date().toISOString();
      if (!existing.data) {
        const { data, error } = await supabaseAdmin()
          .from("model_behavior_sightings")
          .insert({
            merge_key: mergeKey,
            model_id: preferredId,
            status: "pending",
            source: "hosted",
            first_hosted_agent_id: agent.hostedAgentId,
            last_hosted_agent_id: agent.hostedAgentId,
            report_count: 1,
            first_seen_at: now,
            last_seen_at: now,
          })
          .select("id, status")
          .single();
        if (error) throw new Error(error.message);
        res.json({ ok: true, id: data.id, status: data.status });
        return;
      }

      const status = existing.data.status as string;
      if (status === "done" || status === "skipped") {
        await supabaseAdmin()
          .from("model_behavior_sightings")
          .update({
            last_seen_at: now,
            last_hosted_agent_id: agent.hostedAgentId,
          })
          .eq("id", existing.data.id);
        res.json({ ok: true, id: existing.data.id, status, reason: "already_closed" });
        return;
      }

      if (status === "processing" || status === "proposed") {
        await supabaseAdmin()
          .from("model_behavior_sightings")
          .update({
            last_seen_at: now,
            last_hosted_agent_id: agent.hostedAgentId,
            model_id: preferredId.includes("/") ? preferredId : existing.data.model_id,
          })
          .eq("id", existing.data.id);
        res.json({ ok: true, id: existing.data.id, status });
        return;
      }

      const { data, error } = await supabaseAdmin()
        .from("model_behavior_sightings")
        .update({
          status: "pending",
          last_seen_at: now,
          last_hosted_agent_id: agent.hostedAgentId,
          report_count: (existing.data.report_count ?? 1) + 1,
          model_id: preferredId.includes("/") ? preferredId : existing.data.model_id,
          error_message: null,
        })
        .eq("id", existing.data.id)
        .select("id, status")
        .single();
      if (error) throw new Error(error.message);
      res.json({ ok: true, id: data.id, status: data.status });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal error",
      });
    }
  });

  app.get(
    "/ops/model-behavior/sightings/pending",
    opsRateLimit,
    async (req, res) => {
      if (!deps.requireProvisionAuth(req, res)) return;
      try {
        if (!isSupabaseConfigured()) {
          res.status(503).json({ error: "Supabase not configured" });
          return;
        }
        const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 12) || 12));
        const { data, error } = await supabaseAdmin()
          .from("model_behavior_sightings")
          .select("id, model_id, merge_key, report_count, first_seen_at")
          .eq("status", "pending")
          .order("first_seen_at", { ascending: true })
          .limit(limit);
        if (error) throw new Error(error.message);
        res.json({
          pending: (data ?? []).map((row) => ({
            id: row.id,
            modelId: row.model_id,
            mergeKey: row.merge_key,
            reportCount: row.report_count,
            firstSeenAt: row.first_seen_at,
          })),
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : "Internal error",
        });
      }
    },
  );

  app.post("/ops/model-behavior/sightings/ack", opsRateLimit, async (req, res) => {
    if (!deps.requireProvisionAuth(req, res)) return;
    try {
      if (!isSupabaseConfigured()) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }
      const ids = Array.isArray(req.body?.ids)
        ? (req.body.ids as unknown[]).map((id) => String(id)).filter(Boolean)
        : [];
      const status = String(req.body?.status ?? "").trim();
      const allowed = new Set(["processing", "proposed", "done", "failed", "pending"]);
      if (!ids.length || !allowed.has(status)) {
        res.status(400).json({ error: "ids and status required" });
        return;
      }
      const processedBy =
        typeof req.body?.processedBy === "string" ? req.body.processedBy.slice(0, 120) : null;
      const errorMessage =
        typeof req.body?.error === "string" ? req.body.error.slice(0, 500) : null;
      const patch: Record<string, unknown> = {
        status,
        processed_by: processedBy,
        processed_at: new Date().toISOString(),
      };
      if (status === "failed" && errorMessage) patch.error_message = errorMessage;
      if (status === "pending") {
        patch.processed_at = null;
        patch.error_message = null;
      }
      const { error } = await supabaseAdmin()
        .from("model_behavior_sightings")
        .update(patch)
        .in("id", ids);
      if (error) throw new Error(error.message);
      res.json({ ok: true, updated: ids.length, status });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal error",
      });
    }
  });
}
