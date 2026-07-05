import type { Express } from "express";
import { exportEncryptedBundle, importEncryptedBundle } from "./exportBundle.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";

export function registerAdminDataRoutes(app: Express): void {
  app.get("/admin/store-contracts", (_req, res) => {
    res.json({ stores: AGENT_STORE_REGISTRY });
  });

  app.post("/admin/export", async (req, res) => {
    try {
      const body = req.body as { passphrase?: string };
      if (!body.passphrase?.trim()) {
        res.status(400).json({ error: "passphrase required" });
        return;
      }
      const result = await exportEncryptedBundle(body.passphrase.trim());
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/admin/import", async (req, res) => {
    try {
      const body = req.body as { passphrase?: string; ciphertext?: string };
      if (!body.passphrase?.trim() || !body.ciphertext?.trim()) {
        res.status(400).json({ error: "passphrase and ciphertext required" });
        return;
      }
      const result = await importEncryptedBundle(body.ciphertext.trim(), body.passphrase.trim());
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
