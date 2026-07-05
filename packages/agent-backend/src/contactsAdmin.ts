import type { Express } from "express";
import type { TrustedAgentEntry, TrustedAgentsStore } from "./trustedAgentsStore.js";

export interface ContactsAdminDeps {
  trustedAgents: TrustedAgentsStore;
}

export function registerContactsAdminRoutes(app: Express, deps: ContactsAdminDeps): void {
  const { trustedAgents } = deps;

  app.get("/contacts", (_req, res) => {
    res.json({ contacts: trustedAgents.list() });
  });

  app.post("/contacts/sync", (req, res) => {
    try {
      const body = req.body as { contacts?: Partial<TrustedAgentEntry>[] };
      const rows = Array.isArray(body.contacts) ? body.contacts : [];
      const parsed = rows
        .filter((row): row is TrustedAgentEntry => typeof row?.did === "string" && typeof row?.endpoint === "string")
        .map((row) => ({
          did: row.did.trim(),
          endpoint: row.endpoint.trim(),
          name: typeof row.name === "string" ? row.name.trim() : undefined,
          handle: typeof row.handle === "string" ? row.handle.trim() : undefined,
          kind: row.kind,
          source: row.source,
          blocked: row.blocked === true,
          muted: row.muted === true,
          standingDisclosure: Array.isArray(row.standingDisclosure)
            ? row.standingDisclosure.filter((value): value is string => typeof value === "string")
            : undefined,
        }));
      const contacts = trustedAgents.syncAll(parsed);
      res.json({ synced: contacts.length, contacts });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
