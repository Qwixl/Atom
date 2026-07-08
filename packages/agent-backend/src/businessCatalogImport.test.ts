import { describe, expect, it } from "vitest";
import {
  mapShopifyProductsToCatalog,
  mapWooCommerceProductsToCatalog,
  normalizeShopifyShop,
  priceToAmountMinor,
} from "./businessCatalogImport.js";

describe("businessCatalogImport", () => {
  it("normalizes Shopify shop host", () => {
    expect(normalizeShopifyShop("my-cafe")).toBe("my-cafe.myshopify.com");
    expect(normalizeShopifyShop("https://My-Cafe.myshopify.com/")).toBe("my-cafe.myshopify.com");
  });

  it("maps Shopify products to catalog items", () => {
    const items = mapShopifyProductsToCatalog(
      [
        {
          id: 101,
          title: "House blend",
          body_html: "<p>12oz bag</p>",
          status: "active",
          tags: "coffee, beans",
          variants: [{ price: "12.50", inventory_quantity: 3 }],
        },
      ],
      "EUR",
    );
    expect(items).toEqual([
      {
        catalogItemId: "shopify-101",
        label: "House blend",
        description: "12oz bag",
        amount: { currency: "EUR", amountMinor: 1250 },
        available: true,
        tags: ["coffee", "beans"],
      },
    ]);
  });

  it("maps WooCommerce products to catalog items", () => {
    const items = mapWooCommerceProductsToCatalog(
      [
        {
          id: 55,
          name: "Ceramic mug",
          description: "Handmade",
          regular_price: "18.00",
          stock_status: "instock",
          tags: [{ name: "gift" }],
        },
      ],
      "GBP",
    );
    expect(items[0]).toMatchObject({
      catalogItemId: "woocommerce-55",
      label: "Ceramic mug",
      amount: { currency: "GBP", amountMinor: 1800 },
      available: true,
    });
  });

  it("converts major prices to minor units", () => {
    expect(priceToAmountMinor("12.50", "EUR")).toBe(1250);
    expect(priceToAmountMinor("1200", "JPY")).toBe(1200);
  });
});
