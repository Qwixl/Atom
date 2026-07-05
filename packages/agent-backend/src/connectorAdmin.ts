import type { Express, Request } from "express";
import type { ConnectorVault } from "./connectorVault.js";
import { addWebcalFeedToVault, removeWebcalFeedFromVault, WEBCAL_CONNECTOR_ID } from "./webcalConnector.js";
import { getConnectorBackend } from "./connectorRegistry.js";

export interface ConnectorAdminConfig {
  vault: ConnectorVault;
  publicBaseUrl: string;
  allowedOrigins: ReadonlySet<string>;
}

export { WEBCAL_CONNECTOR_ID };

function connectorIdParam(req: Request): string {
  const raw = req.params.connectorId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id?.trim() ?? "";
}

export function registerConnectorAdminRoutes(adminApp: Express, config: ConnectorAdminConfig): void {
  adminApp.get("/connectors/:connectorId", async (req, res) => {
    try {
      const backend = getConnectorBackend(connectorIdParam(req));
      if (!backend) {
        res.status(404).json({ error: `Unknown connector "${connectorIdParam(req)}"` });
        return;
      }
      res.json(await backend.status(config.vault));
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.get("/connectors/:connectorId/status", async (req, res) => {
    try {
      const backend = getConnectorBackend(connectorIdParam(req));
      if (!backend) {
        res.status(404).json({ error: `Unknown connector "${connectorIdParam(req)}"` });
        return;
      }
      res.json(await backend.status(config.vault));
    } catch (error) {
      res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/connectors/:connectorId/invoke", async (req, res) => {
    const connectorId = connectorIdParam(req);
    const body = req.body as {
      operation?: string;
      input?: Record<string, unknown>;
      approvalRef?: string;
    };
    const operation = body.operation?.trim();
    if (!operation) {
      res.status(400).json({ error: "operation required" });
      return;
    }
    if ("accessToken" in (req.body as object) || "feedUrl" in (req.body as object)) {
      res.status(400).json({ error: "Credentials rejected on invoke — use /connectors/webcal/feeds (D044)" });
      return;
    }
    try {
      const backend = getConnectorBackend(connectorId);
      if (!backend) {
        res.status(404).json({ error: `Unknown connector "${connectorId}"` });
        return;
      }
      const result = await backend.invoke(config.vault, operation, body.input ?? {});
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /not configured|Unknown connector|required/i.test(message) ? 400 : 502;
      res.status(status).json({ error: message });
    }
  });

  adminApp.post("/connectors/webcal/feeds", async (req, res) => {
    const body = req.body as { url?: string; label?: string };
    const url = body.url?.trim();
    if (!url) {
      res.status(400).json({ error: "url required" });
      return;
    }
    try {
      const feed = await addWebcalFeedToVault(config.vault, url, body.label);
      res.json({ feed });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.delete("/connectors/webcal/feeds/:feedId", async (req, res) => {
    const feedId = req.params.feedId?.trim();
    if (!feedId) {
      res.status(400).json({ error: "feedId required" });
      return;
    }
    const removed = await removeWebcalFeedFromVault(config.vault, feedId);
    if (!removed) {
      res.status(404).json({ error: "feed not found" });
      return;
    }
    res.json({ removed: true, feedId });
  });
}

export const registerCalendarAdminRoutes = registerConnectorAdminRoutes;
export type CalendarAdminConfig = ConnectorAdminConfig;
