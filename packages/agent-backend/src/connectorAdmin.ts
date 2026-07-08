import type { Express, Request } from "express";

import { allowDevBypassApproval, requireApprovalRef } from "./approvalRef.js";
import { hasSessionScope, isAdminAuth, type AuthenticatedRequest } from "./adminAuth.js";
import type { ConnectorVault } from "./connectorVault.js";

import {

  addBookmarkToVault,

  BOOKMARKS_CONNECTOR_ID,

  removeBookmarkFromVault,

} from "./bookmarksConnector.js";

import { addRssFeedToVault, removeRssFeedFromVault, RSS_CONNECTOR_ID } from "./rssConnector.js";

import { addWebcalFeedToVault, removeWebcalFeedFromVault, WEBCAL_CONNECTOR_ID } from "./webcalConnector.js";

import { getConnectorBackend } from "./connectorRegistry.js";

import { invalidateConnectorCache, invokeConnectorCached } from "./connectorInvoke.js";



export interface ConnectorAdminConfig {

  vault: ConnectorVault;

  publicBaseUrl: string;

  allowedOrigins: ReadonlySet<string>;

}



export { WEBCAL_CONNECTOR_ID, RSS_CONNECTOR_ID, BOOKMARKS_CONNECTOR_ID };



function connectorIdParam(req: Request): string {

  const raw = req.params.connectorId;

  const id = Array.isArray(raw) ? raw[0] : raw;

  return id?.trim() ?? "";

}



function rejectInlineCredentials(req: Request, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {

  if ("accessToken" in (req.body as object) || "feedUrl" in (req.body as object)) {

    res.status(400).json({

      error: "Credentials rejected on invoke — use connector admin feed/bookmark routes (D044)",

    });

    return true;

  }

  return false;

}



function readApprovalRef(req: Request): string | undefined {
  const body = req.body as { approvalRef?: string } | undefined;
  const fromBody = body?.approvalRef?.trim();
  if (fromBody) return fromBody;
  const fromQuery = req.query.approvalRef;
  return typeof fromQuery === "string" ? fromQuery.trim() : undefined;
}

function assertConnectorWriteApproval(req: Request): string {
  return requireApprovalRef(readApprovalRef(req), { allowDevBypass: allowDevBypassApproval() });
}

function assertConnectorReadAuth(req: Request, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (hasSessionScope(req as AuthenticatedRequest, "connector:read")) return true;
  res.status(403).json({ error: "Session token lacks connector:read scope" });
  return false;
}

function assertAdminWriteAuth(req: Request, res: { status: (code: number) => { json: (body: unknown) => void } }): boolean {
  if (isAdminAuth(req as AuthenticatedRequest)) return true;
  res.status(403).json({ error: "Admin token required for connector writes" });
  return false;
}

export function registerConnectorAdminRoutes(adminApp: Express, config: ConnectorAdminConfig): void {

  adminApp.get("/connectors/:connectorId", async (req, res) => {
    if (!assertConnectorReadAuth(req, res)) return;

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
    if (!assertConnectorReadAuth(req, res)) return;

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
    if (!assertConnectorReadAuth(req, res)) return;

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

    if (rejectInlineCredentials(req, res)) return;

    try {

      const backend = getConnectorBackend(connectorId);

      if (!backend) {

        res.status(404).json({ error: `Unknown connector "${connectorId}"` });

        return;

      }

      const operationSpec = backend.operationSpec?.(operation);
      const authReq = req as AuthenticatedRequest;
      if (authReq.auth?.kind === "session") {
        if (!operationSpec || operationSpec.permission === "write") {
          res.status(403).json({ error: "Session token is read-only" });
          return;
        }
      }

      const result = await invokeConnectorCached(

        backend,

        config.vault,

        connectorId,

        operation,

        body.input ?? {},

        operationSpec,

      );

      res.json(result);

    } catch (error) {

      const message = error instanceof Error ? error.message : String(error);

      const status = /not configured|Unknown connector|required/i.test(message) ? 400 : 502;

      res.status(status).json({ error: message });

    }

  });



  adminApp.post("/connectors/webcal/feeds", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertConnectorWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = req.body as { url?: string; label?: string };

    const url = body.url?.trim();

    if (!url) {

      res.status(400).json({ error: "url required" });

      return;

    }

    try {

      const feed = await addWebcalFeedToVault(config.vault, url, body.label);

      invalidateConnectorCache(WEBCAL_CONNECTOR_ID);

      res.json({ feed });

    } catch (error) {

      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });

    }

  });



  adminApp.delete("/connectors/webcal/feeds/:feedId", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertConnectorWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
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

    invalidateConnectorCache(WEBCAL_CONNECTOR_ID);

    res.json({ removed: true, feedId });

  });



  adminApp.post("/connectors/rss/feeds", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertConnectorWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = req.body as { url?: string; label?: string };

    const url = body.url?.trim();

    if (!url) {

      res.status(400).json({ error: "url required" });

      return;

    }

    try {

      const feed = await addRssFeedToVault(config.vault, url, body.label);

      invalidateConnectorCache(RSS_CONNECTOR_ID);

      res.json({ feed });

    } catch (error) {

      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });

    }

  });



  adminApp.delete("/connectors/rss/feeds/:feedId", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertConnectorWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const feedId = req.params.feedId?.trim();

    if (!feedId) {

      res.status(400).json({ error: "feedId required" });

      return;

    }

    const removed = await removeRssFeedFromVault(config.vault, feedId);

    if (!removed) {

      res.status(404).json({ error: "feed not found" });

      return;

    }

    invalidateConnectorCache(RSS_CONNECTOR_ID);

    res.json({ removed: true, feedId });

  });



  adminApp.post("/connectors/bookmarks", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertConnectorWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = req.body as { url?: string; label?: string };

    const url = body.url?.trim();

    if (!url) {

      res.status(400).json({ error: "url required" });

      return;

    }

    try {

      const bookmark = await addBookmarkToVault(config.vault, url, body.label);

      invalidateConnectorCache(BOOKMARKS_CONNECTOR_ID);

      res.json({ bookmark });

    } catch (error) {

      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });

    }

  });



  adminApp.delete("/connectors/bookmarks/:bookmarkId", async (req, res) => {
    if (!assertAdminWriteAuth(req, res)) return;
    try {
      assertConnectorWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const bookmarkId = req.params.bookmarkId?.trim();

    if (!bookmarkId) {

      res.status(400).json({ error: "bookmarkId required" });

      return;

    }

    const removed = await removeBookmarkFromVault(config.vault, bookmarkId);

    if (!removed) {

      res.status(404).json({ error: "bookmark not found" });

      return;

    }

    invalidateConnectorCache(BOOKMARKS_CONNECTOR_ID);

    res.json({ removed: true, bookmarkId });

  });

}



export const registerCalendarAdminRoutes = registerConnectorAdminRoutes;

export type CalendarAdminConfig = ConnectorAdminConfig;


