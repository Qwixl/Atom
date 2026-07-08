import type { BusinessCatalogItemValue } from "@qwixl/owner-store";
import { validateConnectorHttpsUrl } from "./connectorUrl.js";

const SHOPIFY_API_VERSION = "2024-10";
const ZERO_DECIMAL_CURRENCIES = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export function normalizeShopifyShop(raw: string): string {
  const trimmed = raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("shop required");
  }
  if (trimmed.includes(".myshopify.com")) {
    return trimmed.toLowerCase();
  }
  return `${trimmed.toLowerCase()}.myshopify.com`;
}

export function normalizeWooCommerceStoreUrl(raw: string): string {
  const url = validateConnectorHttpsUrl(raw.trim());
  return url.replace(/\/+$/, "");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function priceToAmountMinor(price: string | number, currency: string): number | null {
  const n = typeof price === "number" ? price : Number(String(price).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const code = currency.trim().toUpperCase() || "USD";
  if (ZERO_DECIMAL_CURRENCIES.has(code)) {
    return Math.round(n);
  }
  return Math.round(n * 100);
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: unknown = text;
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    const detail =
      typeof parsed === "object" && parsed !== null && "message" in parsed
        ? String((parsed as { message: unknown }).message)
        : text.slice(0, 240);
    throw new Error(`Store API request failed (${response.status}): ${detail}`);
  }
  return parsed;
}

export async function fetchShopifyShopCurrency(shop: string, accessToken: string): Promise<string> {
  const host = normalizeShopifyShop(shop);
  const raw = (await fetchJson(`https://${host}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      Accept: "application/json",
    },
  })) as { shop?: { currency?: string } };
  return raw.shop?.currency?.trim().toUpperCase() || "USD";
}

export function mapShopifyProductsToCatalog(
  products: Array<Record<string, unknown>>,
  currency: string,
): BusinessCatalogItemValue[] {
  const items: BusinessCatalogItemValue[] = [];
  for (const product of products) {
    const id = product.id;
    const title = String(product.title ?? "").trim();
    if (id === undefined || !title) continue;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants.find((entry) => {
      const row = entry as { price?: string };
      return priceToAmountMinor(row.price ?? "", currency) !== null;
    }) as { price?: string; inventory_quantity?: number } | undefined;
    if (!variant) continue;
    const amountMinor = priceToAmountMinor(variant.price ?? "", currency);
    if (amountMinor === null) continue;
    const status = String(product.status ?? "active");
    const inventory = Number(variant.inventory_quantity ?? 0);
    const available = status === "active" && (inventory > 0 || inventory === undefined);
    const tags = String(product.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    items.push({
      catalogItemId: `shopify-${String(id)}`,
      label: title,
      description: stripHtml(String(product.body_html ?? "")) || undefined,
      amount: { currency, amountMinor },
      available,
      tags: tags.length > 0 ? tags : undefined,
    });
  }
  return items;
}

export async function importShopifyCatalog(
  shop: string,
  accessToken: string,
  limit = 100,
): Promise<{ items: BusinessCatalogItemValue[]; currency: string }> {
  const host = normalizeShopifyShop(shop);
  const currency = await fetchShopifyShopCurrency(host, accessToken);
  const capped = Math.min(Math.max(limit, 1), 250);
  const raw = (await fetchJson(
    `https://${host}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${capped}&status=active`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        Accept: "application/json",
      },
    },
  )) as { products?: Array<Record<string, unknown>> };
  const products = Array.isArray(raw.products) ? raw.products : [];
  return { currency, items: mapShopifyProductsToCatalog(products, currency) };
}

export function mapWooCommerceProductsToCatalog(
  products: Array<Record<string, unknown>>,
  currency: string,
): BusinessCatalogItemValue[] {
  const items: BusinessCatalogItemValue[] = [];
  for (const product of products) {
    const id = product.id;
    const title = String(product.name ?? "").trim();
    if (id === undefined || !title) continue;
    const price = String(product.price ?? product.regular_price ?? "").trim();
    const amountMinor = priceToAmountMinor(price, currency);
    if (amountMinor === null) continue;
    const stockStatus = String(product.stock_status ?? "instock");
    const tags = Array.isArray(product.tags)
      ? product.tags
          .map((tag) => (typeof tag === "object" && tag !== null ? String((tag as { name?: string }).name ?? "") : String(tag)))
          .filter(Boolean)
      : String(product.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
    items.push({
      catalogItemId: `woocommerce-${String(id)}`,
      label: title,
      description: stripHtml(String(product.description ?? product.short_description ?? "")) || undefined,
      amount: { currency, amountMinor },
      available: stockStatus === "instock",
      tags: tags.length > 0 ? tags : undefined,
    });
  }
  return items;
}

export async function importWooCommerceCatalog(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  limit = 100,
  currency = "USD",
): Promise<{ items: BusinessCatalogItemValue[]; currency: string }> {
  const base = normalizeWooCommerceStoreUrl(storeUrl);
  const capped = Math.min(Math.max(limit, 1), 100);
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`, "utf8").toString("base64");
  const raw = (await fetchJson(
    `${base}/wp-json/wc/v3/products?per_page=${capped}&status=publish`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    },
  )) as Array<Record<string, unknown>>;
  const products = Array.isArray(raw) ? raw : [];
  return { currency: currency.trim().toUpperCase() || "USD", items: mapWooCommerceProductsToCatalog(products, currency) };
}
