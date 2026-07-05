import type { Express } from "express";
import type { BusinessIndexEntry, IndexEntryKind } from "@qwixl/business-index";
import type { AgentKeyPair } from "@qwixl/protocol";
import type { AgentBackendConfig } from "./config.js";
import { HandleCacheStore } from "./handleCache.js";
import {
  buildAgentCapabilities,
  resolveDiscoverEntry,
  type AgentCapabilities,
} from "./serviceDiscovery.js";
import { runDiscoverSearch } from "./discoverSearch.js";
import type { RoomStore } from "./roomStore.js";

export interface DiscoverAdminDeps {
  identity: AgentKeyPair;
  config: AgentBackendConfig;
  rooms: RoomStore;
  businessDomain?: string | null;
  handleCache?: HandleCacheStore;
}

export function registerDiscoverPublicRoutes(app: Express, deps: DiscoverAdminDeps): void {
  app.get("/discover/capabilities", (_req, res) => {
    const capabilities = buildAgentCapabilities({
      config: deps.config,
      localDid: deps.identity.did,
      rooms: deps.rooms,
      businessDomain: deps.businessDomain,
    });
    res.json(capabilities satisfies AgentCapabilities);
  });
}

function localCapabilitiesFor(deps: DiscoverAdminDeps) {
  return buildAgentCapabilities({
    config: deps.config,
    localDid: deps.identity.did,
    rooms: deps.rooms,
    businessDomain: deps.businessDomain,
  });
}

export function registerDiscoverAdminRoutes(app: Express, deps: DiscoverAdminDeps): void {
  app.post("/discover/resolve", async (req, res) => {
    try {
      const body = req.body as Partial<BusinessIndexEntry>;
      if (!body.displayName?.trim()) {
        res.status(400).json({ error: "displayName required" });
        return;
      }
      const entry = body as BusinessIndexEntry;
      const resolved = await resolveDiscoverEntry({
        entry,
        localCapabilities: localCapabilitiesFor(deps),
        handleCache: deps.handleCache,
      });
      res.json({ resolved });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/discover/availability", async (req, res) => {
    try {
      const body = req.body as { entries?: BusinessIndexEntry[] };
      const entries = Array.isArray(body.entries) ? body.entries : [];
      const localCapabilities = localCapabilitiesFor(deps);
      const settled = await Promise.all(
        entries.map(async (entry) => {
          try {
            const resolved = await resolveDiscoverEntry({
              entry,
              localCapabilities,
              handleCache: deps.handleCache,
            });
            return { entry, resolved };
          } catch {
            return null;
          }
        }),
      );
      res.json({ available: settled.filter((row) => row !== null) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/discover/search", async (req, res) => {
    try {
      const body = req.body as {
        terms?: string;
        kind?: IndexEntryKind;
        indexBaseUrl?: string;
        indexes?: Array<{ label?: string; url?: string }>;
      };
      const terms = body.terms?.trim() ?? "";
      if (!terms) {
        res.status(400).json({ error: "terms required" });
        return;
      }
      const indexes =
        Array.isArray(body.indexes) && body.indexes.length > 0
          ? body.indexes
              .filter((row) => typeof row?.label === "string" && typeof row?.url === "string")
              .map((row) => ({ label: row.label!.trim(), url: row.url!.trim() }))
          : undefined;
      const { results, summary } = await runDiscoverSearch({
        terms,
        kind: body.kind,
        config: deps.config,
        identity: deps.identity,
        rooms: deps.rooms,
        businessDomain: deps.businessDomain,
        handleCache: deps.handleCache ?? new HandleCacheStore(),
        indexBaseUrl: body.indexBaseUrl?.trim(),
        indexes,
      });
      res.json({ summary, results });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
