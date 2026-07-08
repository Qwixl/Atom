import type { Express, Request, Response } from "express";
import { isSupabaseConfigured, supabaseAdmin } from "./supabaseAdmin.js";
import { verifySupabaseAccessToken } from "./supabaseAuth.js";

type WorkspaceKind = "personal" | "business" | "developer";

async function requireUser(req: Request, res: Response) {
  const user = await verifySupabaseAccessToken(req);
  if (!user) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  return user;
}

export function registerWorkspaceRoutes(app: Express): void {
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
    const body = req.body as { kind?: WorkspaceKind; label?: string; handle?: string; businessDomain?: string };
    const kind = body.kind;
    if (kind !== "business" && kind !== "developer") {
      res.status(400).json({ error: "kind must be business or developer" });
      return;
    }
    const label = body.label?.trim() || (kind === "business" ? "Business" : "Developer");
    try {
      const { data, error } = await supabaseAdmin()
        .from("workspaces")
        .insert({
          owner_user_id: user.id,
          kind,
          label,
          handle: body.handle?.trim() || null,
          business_domain: body.businessDomain?.trim() || null,
        })
        .select("id, kind, label, handle, business_domain, created_at")
        .single();
      if (error) throw new Error(error.message);
      res.status(201).json({
        workspace: {
          id: data.id,
          kind: data.kind,
          label: data.label,
          handle: data.handle ?? undefined,
          businessDomain: data.business_domain ?? undefined,
          createdAt: data.created_at,
        },
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
      const { data, error } = await supabaseAdmin()
        .from("workspaces")
        .insert({
          owner_user_id: user.id,
          kind: "personal",
          label: "Personal",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      res.json({ workspaceId: data.id, created: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
