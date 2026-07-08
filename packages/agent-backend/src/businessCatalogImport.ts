import type { BusinessCatalogItemValue } from "@qwixl/owner-store";
import type { SquareEnvironment } from "./connectorVault.js";
import { validateConnectorHttpsUrl } from "./connectorUrl.js";

export type { SquareEnvironment };

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

const SQUARE_API_VERSION = "2024-11-20";

export function normalizeSquareEnvironment(raw: string): SquareEnvironment {
  return raw.trim().toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export function squareApiBase(environment: SquareEnvironment): string {
  return environment === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

export function mapSquareCatalogObjectsToCatalog(
  objects: Array<Record<string, unknown>>,
): BusinessCatalogItemValue[] {
  const items: BusinessCatalogItemValue[] = [];
  for (const object of objects) {
    if (String(object.type ?? "") !== "ITEM") continue;
    const id = object.id;
    const itemData = object.item_data as Record<string, unknown> | undefined;
    if (id === undefined || !itemData) continue;
    const title = String(itemData.name ?? "").trim();
    if (!title) continue;
    const variations = Array.isArray(itemData.variations) ? itemData.variations : [];
    let amountMinor: number | null = null;
    let currency = "USD";
    for (const variation of variations) {
      const row = variation as Record<string, unknown>;
      const varData = row.item_variation_data as Record<string, unknown> | undefined;
      const priceMoney = varData?.price_money as { amount?: number; currency?: string } | undefined;
      const amount = Number(priceMoney?.amount ?? 0);
      if (Number.isFinite(amount) && amount > 0) {
        amountMinor = Math.round(amount);
        currency = String(priceMoney?.currency ?? "USD").trim().toUpperCase() || "USD";
        break;
      }
    }
    if (amountMinor === null) continue;
    const description = String(itemData.description ?? "").trim() || undefined;
    items.push({
      catalogItemId: `square-${String(id)}`,
      label: title,
      description,
      amount: { currency, amountMinor },
      available: object.is_deleted !== true && variations.length > 0,
    });
  }
  return items;
}

export async function importSquareCatalog(
  accessToken: string,
  environment: SquareEnvironment = "production",
  limit = 100,
): Promise<{ items: BusinessCatalogItemValue[]; currency: string }> {
  const base = squareApiBase(environment);
  const capped = Math.min(Math.max(limit, 1), 1000);
  const objects: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  while (objects.length < capped) {
    const pageLimit = Math.min(100, capped - objects.length);
    const body: Record<string, unknown> = {
      object_types: ["ITEM"],
      include_related_objects: false,
      limit: pageLimit,
    };
    if (cursor) body.cursor = cursor;
    const raw = (await fetchJson(`${base}/v2/catalog/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Square-Version": SQUARE_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })) as { objects?: Array<Record<string, unknown>>; cursor?: string };
    const page = Array.isArray(raw.objects) ? raw.objects : [];
    objects.push(...page);
    cursor = typeof raw.cursor === "string" && raw.cursor.trim() ? raw.cursor.trim() : undefined;
    if (!cursor || page.length === 0) break;
  }
  const items = mapSquareCatalogObjectsToCatalog(objects.slice(0, capped));
  return { items, currency: items[0]?.amount.currency ?? "USD" };
}
