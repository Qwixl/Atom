import type { Express } from "express";
import { BUSINESS_POLICY_CATEGORY, type BusinessCatalogItemValue } from "@qwixl/owner-store";
import { allowDevBypassApproval, requireApprovalRef } from "./approvalRef.js";
import type { BusinessCatalogStore } from "./businessCatalogStore.js";
import {
  importShopifyCatalog,
  importWooCommerceCatalog,
} from "./businessCatalogImport.js";
import type { ConnectorVault } from "./connectorVault.js";
import type { BusinessContextStore, BusinessContextRecord } from "./businessContextStore.js";
import { parseBusinessContextRecord } from "./businessContextStore.js";
import type {
  BusinessKnowledgeCategory,
  BusinessKnowledgeDocument,
  BusinessKnowledgeBackend,
} from "./businessKnowledgeBackend.js";
import type { BusinessStore } from "./businessStore.js";
import type { BusinessVerificationStore } from "./businessVerificationStore.js";

export interface BusinessAdminDeps {
  catalog: BusinessCatalogStore;
  context: BusinessContextStore;
  knowledge: BusinessKnowledgeBackend;
  store: BusinessStore;
  verification: BusinessVerificationStore;
  vault: ConnectorVault;
}

function readApprovalRef(req: { body?: unknown; query?: unknown }): string | undefined {
  const body = req.body as { approvalRef?: string } | undefined;
  const fromBody = body?.approvalRef?.trim();
  if (fromBody) return fromBody;
  const fromQuery = (req.query as { approvalRef?: string } | undefined)?.approvalRef;
  return typeof fromQuery === "string" ? fromQuery.trim() : undefined;
}

function assertBusinessWriteApproval(req: { body?: unknown; query?: unknown }): string {
  return requireApprovalRef(readApprovalRef(req), { allowDevBypass: allowDevBypassApproval() });
}

function syncCatalogToKnowledge(
  knowledge: BusinessKnowledgeBackend,
  items: BusinessCatalogItemValue[],
): void {
  for (const item of items) {
    if (!item.description?.trim()) continue;
    knowledge.upsert({
      id: `product-${item.catalogItemId}`,
      title: item.label,
      category: "product",
      body: item.description.trim(),
    });
  }
}

export function syncContextPoliciesToKnowledge(
  context: BusinessContextStore,
  knowledge: BusinessKnowledgeBackend,
): void {
  for (const record of context.list(BUSINESS_POLICY_CATEGORY)) {
    knowledge.upsertPolicyReference(record.label, record.value);
  }
}

function parseKnowledgeDocument(body: Record<string, unknown>): {
  id?: string;
  title: string;
  category?: BusinessKnowledgeCategory;
  body: string;
} {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const docBody = typeof body.body === "string" ? body.body.trim() : "";
  if (!title || !docBody) throw new Error("title and body required");
  const id = typeof body.id === "string" ? body.id.trim() : undefined;
  const category =
    typeof body.category === "string" ? (body.category as BusinessKnowledgeCategory) : undefined;
  return { id, title, category, body: docBody };
}

function parseCatalogItem(body: Record<string, unknown>): BusinessCatalogItemValue {
  const catalogItemId = typeof body.catalogItemId === "string" ? body.catalogItemId.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const currency =
    typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const amountMinor = body.amountMinor;
  if (!catalogItemId || !label || !currency || typeof amountMinor !== "number") {
    throw new Error("catalogItemId, label, currency, and amountMinor required");
  }
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("amountMinor must be a positive integer");
  }
  return {
    catalogItemId,
    label,
    description: typeof body.description === "string" ? body.description.trim() : undefined,
    amount: { currency, amountMinor },
    available: body.available !== false,
    terms: Array.isArray(body.terms)
      ? body.terms.filter((t): t is string => typeof t === "string")
      : undefined,
    tags: Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    sponsored: body.sponsored === true,
    sponsoredRank: typeof body.sponsoredRank === "number" ? body.sponsoredRank : undefined,
  };
}

export function registerBusinessAdminRoutes(adminApp: Express, deps: BusinessAdminDeps): void {
  adminApp.get("/business/catalog", (_req, res) => {
    res.json({ catalog: deps.catalog.list() });
  });

  adminApp.post("/business/catalog", (req, res) => {
    try {
      const item = parseCatalogItem(req.body as Record<string, unknown>);
      deps.catalog.upsert(item);
      res.json({ item });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/business/catalog/sync", (req, res) => {
    const body = req.body as { items?: BusinessCatalogItemValue[] };
    if (!Array.isArray(body.items)) {
      res.status(400).json({ error: "items array required" });
      return;
    }
    try {
      deps.catalog.replaceAll(body.items);
      res.json({ catalog: deps.catalog.list() });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.delete("/business/catalog/:catalogItemId", (req, res) => {
    const removed = deps.catalog.remove(req.params.catalogItemId);
    if (!removed) {
      res.status(404).json({ error: "Catalog item not found" });
      return;
    }
    res.json({ ok: true });
  });

  adminApp.get("/business/store/status", (_req, res) => {
    const shopify = deps.vault.getShopifyStore();
    const woocommerce = deps.vault.getWooCommerceStore();
    res.json({
      shopify: { configured: Boolean(shopify?.accessToken), configuredAt: shopify?.configuredAt },
      woocommerce: {
        configured: Boolean(woocommerce?.consumerKey),
        configuredAt: woocommerce?.configuredAt,
      },
    });
  });

  adminApp.post("/business/store/shopify", async (req, res) => {
    try {
      assertBusinessWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = req.body as { shop?: string; accessToken?: string };
    const shop = body.shop?.trim();
    const accessToken = body.accessToken?.trim();
    if (!shop || !accessToken) {
      res.status(400).json({ error: "shop and accessToken required" });
      return;
    }
    try {
      await deps.vault.setShopifyStore(shop, accessToken);
      res.json({ configured: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.delete("/business/store/shopify", async (req, res) => {
    try {
      assertBusinessWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    await deps.vault.clearShopifyStore();
    res.json({ removed: true });
  });

  adminApp.post("/business/store/woocommerce", async (req, res) => {
    try {
      assertBusinessWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = req.body as { storeUrl?: string; consumerKey?: string; consumerSecret?: string };
    const storeUrl = body.storeUrl?.trim();
    const consumerKey = body.consumerKey?.trim();
    const consumerSecret = body.consumerSecret?.trim();
    if (!storeUrl || !consumerKey || !consumerSecret) {
      res.status(400).json({ error: "storeUrl, consumerKey, and consumerSecret required" });
      return;
    }
    try {
      await deps.vault.setWooCommerceStore(storeUrl, consumerKey, consumerSecret);
      res.json({ configured: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.delete("/business/store/woocommerce", async (req, res) => {
    try {
      assertBusinessWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    await deps.vault.clearWooCommerceStore();
    res.json({ removed: true });
  });

  adminApp.post("/business/catalog/import/shopify", async (req, res) => {
    try {
      assertBusinessWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const stored = deps.vault.getShopifyStore();
    if (!stored) {
      res.status(400).json({ error: "Shopify store not configured" });
      return;
    }
    const body = req.body as { limit?: number; syncKnowledge?: boolean };
    try {
      const imported = await importShopifyCatalog(stored.shop, stored.accessToken, body.limit);
      deps.catalog.replaceAll(imported.items);
      if (body.syncKnowledge !== false) {
        syncCatalogToKnowledge(deps.knowledge, imported.items);
      }
      res.json({
        source: "shopify",
        importedCount: imported.items.length,
        currency: imported.currency,
        catalog: deps.catalog.list(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(/not configured|required/i.test(message) ? 400 : 502).json({ error: message });
    }
  });

  adminApp.post("/business/catalog/import/woocommerce", async (req, res) => {
    try {
      assertBusinessWriteApproval(req);
    } catch (error) {
      res.status(403).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const stored = deps.vault.getWooCommerceStore();
    if (!stored) {
      res.status(400).json({ error: "WooCommerce store not configured" });
      return;
    }
    const body = req.body as { limit?: number; currency?: string; syncKnowledge?: boolean };
    try {
      const imported = await importWooCommerceCatalog(
        stored.storeUrl,
        stored.consumerKey,
        stored.consumerSecret,
        body.limit,
        body.currency,
      );
      deps.catalog.replaceAll(imported.items);
      if (body.syncKnowledge !== false) {
        syncCatalogToKnowledge(deps.knowledge, imported.items);
      }
      res.json({
        source: "woocommerce",
        importedCount: imported.items.length,
        currency: imported.currency,
        catalog: deps.catalog.list(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(/not configured|required/i.test(message) ? 400 : 502).json({ error: message });
    }
  });

  adminApp.get("/business/context", (_req, res) => {
    res.json({
      brand: deps.context.list("business-brand"),
      policy: deps.context.list("business-policy"),
    });
  });

  adminApp.post("/business/context", (req, res) => {
    try {
      const record = parseBusinessContextRecord(req.body as Record<string, unknown>);
      deps.context.upsert(record);
      res.json({ record });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/business/context/sync", (req, res) => {
    const body = req.body as { records?: BusinessContextRecord[] };
    if (!Array.isArray(body.records)) {
      res.status(400).json({ error: "records array required" });
      return;
    }
    try {
      deps.context.replaceAll(body.records);
      syncContextPoliciesToKnowledge(deps.context, deps.knowledge);
      res.json({
        brand: deps.context.list("business-brand"),
        policy: deps.context.list("business-policy"),
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.get("/business/knowledge", (_req, res) => {
    res.json({ documents: deps.knowledge.list() });
  });

  adminApp.post("/business/knowledge", (req, res) => {
    try {
      const document = deps.knowledge.upsert(parseKnowledgeDocument(req.body as Record<string, unknown>));
      res.json({ document });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/business/knowledge/sync", (req, res) => {
    const body = req.body as { documents?: BusinessKnowledgeDocument[] };
    if (!Array.isArray(body.documents)) {
      res.status(400).json({ error: "documents array required" });
      return;
    }
    try {
      deps.knowledge.replaceAll(body.documents);
      res.json({ documents: deps.knowledge.list() });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.delete("/business/knowledge/:documentId", (req, res) => {
    const removed = deps.knowledge.remove(req.params.documentId);
    if (!removed) {
      res.status(404).json({ error: "Knowledge document not found" });
      return;
    }
    res.json({ ok: true });
  });

  adminApp.delete("/business/context/:category/:label", (req, res) => {
    const category = req.params.category;
    if (category !== "business-brand" && category !== "business-policy") {
      res.status(400).json({ error: "category must be business-brand or business-policy" });
      return;
    }
    const removed = deps.context.remove(category, req.params.label);
    if (!removed) {
      res.status(404).json({ error: "Context record not found" });
      return;
    }
    res.json({ ok: true });
  });

  adminApp.get("/business/verification", async (_req, res) => {
    try {
      const record = await deps.verification.recheck();
      res.json({ verification: record ?? null });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/business/verification/claim", async (req, res) => {
    const domain = (req.body as { domain?: string }).domain?.trim();
    if (!domain) {
      res.status(400).json({ error: "domain required" });
      return;
    }
    try {
      const verification = await deps.verification.claim(domain);
      res.json({ verification });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/business/verification/revoke", (req, res) => {
    const reason = (req.body as { reason?: string }).reason;
    const allowed = ["domain-lapse", "failed-recheck", "fraud", "policy", "manual"] as const;
    const code = allowed.includes(reason as (typeof allowed)[number])
      ? (reason as (typeof allowed)[number])
      : "manual";
    const record = deps.verification.revoke(code);
    res.json({ verification: record ?? null });
  });

  adminApp.post("/business/intent", async (req, res) => {
    const body = req.body as {
      intentId?: string;
      catalogItemId?: string;
      query?: string;
      replyUrl?: string;
      peerUrl?: string;
      peerDid?: string;
      encrypt?: boolean;
      maxAmountMinor?: number;
      currency?: string;
    };
    if (!body.intentId?.trim()) {
      res.status(400).json({ error: "intentId required" });
      return;
    }
    if (!body.catalogItemId?.trim() && !body.query?.trim()) {
      res.status(400).json({ error: "catalogItemId or query required" });
      return;
    }
    try {
      const object = await deps.store.sendIntent({
        payload: {
          intentId: body.intentId.trim(),
          catalogItemId: body.catalogItemId?.trim(),
          query: body.query?.trim(),
          replyUrl: body.replyUrl?.trim(),
          peerDid: body.peerDid?.trim(),
          constraints:
            body.maxAmountMinor !== undefined || body.currency
              ? {
                  maxAmountMinor: body.maxAmountMinor,
                  currency: body.currency?.trim().toUpperCase(),
                }
              : undefined,
        },
        peerUrl: body.peerUrl?.trim(),
        peerDid: body.peerDid?.trim(),
        encrypt: body.encrypt,
      });
      res.json({ object });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/business/offer", async (req, res) => {
    const body = req.body as {
      intentId?: string;
      catalogItemId?: string;
      peerUrl?: string;
      peerDid?: string;
      encrypt?: boolean;
    };
    if (!body.intentId?.trim() || !body.catalogItemId?.trim() || !body.peerUrl?.trim()) {
      res.status(400).json({ error: "intentId, catalogItemId, and peerUrl required" });
      return;
    }
    try {
      const object = await deps.store.sendOffer({
        intentId: body.intentId.trim(),
        catalogItemId: body.catalogItemId.trim(),
        peerUrl: body.peerUrl.trim(),
        peerDid: body.peerDid?.trim(),
        encrypt: body.encrypt,
      });
      res.json({ object });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
