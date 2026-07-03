/** M8 module store listing price (D028). Payment processing deferred; purchaseUrl is external until billing ships. */
export interface ModulePricing {
  /** `free` (default when omitted) or `paid`. */
  model: "free" | "paid";
  /** Price in USD cents when `model` is `paid`. */
  priceCents?: number;
  /** ISO 4217; v1 supports USD only. */
  currency?: "USD";
  /** External checkout URL until Qwixl store billing is live. */
  purchaseUrl?: string;
}

export function validateModulePricing(raw: unknown, moduleId: string): ModulePricing | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Module ${moduleId}: pricing must be an object`);
  }
  const p = raw as Record<string, unknown>;
  const model = p.model;
  if (model !== "free" && model !== "paid") {
    throw new Error(`Module ${moduleId}: pricing.model must be "free" or "paid"`);
  }
  if (model === "free") {
    return { model: "free" };
  }
  const priceCents = p.priceCents;
  if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents <= 0) {
    throw new Error(`Module ${moduleId}: paid modules require pricing.priceCents (positive integer)`);
  }
  const currency = p.currency === undefined ? "USD" : p.currency;
  if (currency !== "USD") {
    throw new Error(`Module ${moduleId}: pricing.currency must be USD in v1`);
  }
  const purchaseUrl = p.purchaseUrl;
  if (typeof purchaseUrl !== "string" || !/^https?:\/\//.test(purchaseUrl)) {
    throw new Error(`Module ${moduleId}: paid modules require pricing.purchaseUrl (http(s) URL)`);
  }
  return { model: "paid", priceCents, currency: "USD", purchaseUrl };
}

export function normalizeModulePricing(pricing?: ModulePricing): ModulePricing {
  return pricing ?? { model: "free" };
}

export function formatModulePrice(pricing?: ModulePricing): string {
  const normalized = normalizeModulePricing(pricing);
  if (normalized.model === "free") return "Free";
  const dollars = (normalized.priceCents ?? 0) / 100;
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}

/** During beta all paid modules install without checkout (D028). */
export const MODULE_STORE_BETA_FREE = true;

export function modulePriceLabel(pricing?: ModulePricing): string {
  const base = formatModulePrice(pricing);
  if (normalizeModulePricing(pricing).model === "paid" && MODULE_STORE_BETA_FREE) {
    return `${base} · free during beta`;
  }
  return base;
}
