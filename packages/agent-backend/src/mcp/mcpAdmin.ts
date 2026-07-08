import type { Express, Request } from "express";
import { allowDevBypassApproval, requireApprovalRef } from "../approvalRef.js";
import { hasSessionScope, isAdminAuth, type AuthenticatedRequest } from "../adminAuth.js";
import type { McpRuntime } from "./mcpRuntime.js";
import type { McpServersStore } from "./mcpServersStore.js";
import { toMcpServerPublicView, type StoredMcpServer } from "./types.js";

export interface McpAdminConfig {
  store: McpServersStore;
  runtime: McpRuntime;
}

function serverIdParam(req: Request): string {
  const raw = req.params.serverId;
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
}

function readApprovalRef(req: Request): string | undefined {
  const body = req.body as { approvalRef?: string } | undefined;
  const fromBody = body?.approvalRef?.trim();
  if (fromBody) return fromBody;
  const fromQuery = req.query.approvalRef;
  return typeof fromQuery === "string" ? fromQuery.trim() : undefined;
}

function assertMcpReadAuth(req: Request, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (hasSessionScope(req as AuthenticatedRequest, "connector:read")) return true;
  if (isAdminAuth(req as AuthenticatedRequest)) return true;
  res.status(403).json({ error: "Session token lacks connector:read scope" });
  return false;
}

function assertAdminWriteAuth(req: Request, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (isAdminAuth(req as AuthenticatedRequest)) return true;
  res.status(403).json({ error: "Admin token required for MCP server writes" });
  return false;
}

function assertMcpWriteApproval(req: Request): string {
  return requireApprovalRef(readApprovalRef(req), { allowDevBypass: allowDevBypassApproval() });
}

function slugServerId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || `mcp-${Date.now().toString(36)}`;
}

export function registerMcpAdminRoutes(adminApp: Express, config: McpAdminConfig): void {
  const { store, runtime } = config;

  adminApp.get("/mcp/servers", (req, res) => {
    if (!assertMcpReadAuth(req, res)) return;
    res.json({ servers: store.list().map(toMcpServerPublicView) });
  });

  adminApp.post("/mcp/servers", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertMcpWriteApproval(req);
      const body = req.body as {
        id?: string;
        label?: string;
        command?: string;
        args?: string[] | string;
        cwd?: string;
        allowedTools?: string[];
      };
      const label = String(body.label ?? "").trim();
      const command = String(body.command ?? "").trim();
      if (!label || !command) {
        res.status(400).json({ error: "label and command are required" });
        return;
      }
      const args =
        typeof body.args === "string"
          ? body.args.split(/\s+/).filter(Boolean)
          : Array.isArray(body.args)
            ? body.args.map((arg) => String(arg))
            : [];
      const id = String(body.id ?? slugServerId(label)).trim();
      const server: StoredMcpServer = {
        id,
        label,
        command,
        args,
        cwd: body.cwd?.trim() || undefined,
        allowedTools: Array.isArray(body.allowedTools) ? body.allowedTools.map(String) : [],
        enabled: true,
        addedAt: Date.now(),
      };
      await store.add(server);
      res.status(201).json({ server: toMcpServerPublicView(server) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.delete("/mcp/servers/:serverId", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertMcpWriteApproval(req);
      const removed = await store.remove(serverIdParam(req));
      if (!removed) {
        res.status(404).json({ error: "MCP server not found" });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.get("/mcp/servers/:serverId/tools", async (req, res) => {
    if (!assertMcpReadAuth(req, res)) return;
    const server = store.get(serverIdParam(req));
    if (!server) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    try {
      const tools = await runtime.listTools(server);
      res.json({ serverId: server.id, tools });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/mcp/servers/:serverId/tools/call", async (req, res) => {
    if (!assertMcpReadAuth(req, res)) return;
    const server = store.get(serverIdParam(req));
    if (!server) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }
    const body = req.body as { toolName?: string; arguments?: Record<string, unknown> };
    const toolName = String(body.toolName ?? "").trim();
    if (!toolName) {
      res.status(400).json({ error: "toolName is required" });
      return;
    }
    try {
      const result = await runtime.callTool(server, toolName, body.arguments ?? {});
      res.json({ serverId: server.id, toolName, result });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/mcp/servers/:serverId/allowed-tools", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertMcpWriteApproval(req);
      const id = serverIdParam(req);
      const body = req.body as { allowedTools?: string[] };
      if (!Array.isArray(body.allowedTools)) {
        res.status(400).json({ error: "allowedTools array required" });
        return;
      }
      await store.updateAllowedTools(id, body.allowedTools.map(String));
      const server = store.get(id);
      res.json({ server: server ? toMcpServerPublicView(server) : null });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
