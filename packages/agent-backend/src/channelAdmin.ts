import type { Express } from "express";
import type { DisputeChannelStore } from "./disputeChannelStore.js";

export interface ChannelAdminDeps {
  store: DisputeChannelStore;
}

export function registerChannelAdminRoutes(adminApp: Express, deps: ChannelAdminDeps): void {
  adminApp.get("/channels", async (_req, res) => {
    try {
      res.json({ channels: deps.store.list() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.get("/channels/:transactionId", async (req, res) => {
    try {
      const snapshot = deps.store.getByTransaction(req.params.transactionId);
      if (!snapshot) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }
      res.json({ channel: snapshot });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/channels/:transactionId/anchor", async (req, res) => {
    const body = req.body as {
      note?: string;
      peerUrl?: string;
      peerDid?: string;
      encrypt?: boolean;
    };
    try {
      const result = await deps.store.anchor({
        transactionId: req.params.transactionId,
        note: body.note?.trim(),
        peerUrl: body.peerUrl?.trim(),
        peerDid: body.peerDid?.trim(),
        encrypt: body.encrypt,
      });
      res.json({ channel: result.snapshot, anchor: result.anchorObject });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
