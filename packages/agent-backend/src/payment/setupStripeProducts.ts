/**
 * Idempotent Stripe catalog setup for Atom agent-mediated commerce.
 * Run: STRIPE_SECRET_KEY=sk_test_... pnpm --filter @qwixl/agent-backend setup:stripe
 *
 * Creates (or reuses) a Product + optional catalog Price. PaymentIntents for
 * holds use dynamic amounts; the Product groups transactions in Stripe Dashboard.
 */
import { fileURLToPath } from "node:url";
import { loadAgentBackendConfig } from "../config.js";
import {
  stripeRequest,
  type StripeList,
  type StripePrice,
  type StripeProduct,
} from "./stripeClient.js";
import { createStripePaymentRail, resolveStripeSecretKey } from "./stripeRail.js";

const ATOM_PRODUCT_NAME = "Atom Agent Commerce";
const ATOM_PRODUCT_METADATA_KEY = "atom_catalog";
const ATOM_PRODUCT_METADATA_VALUE = "commerce-v1";

export interface StripeCatalogSetupResult {
  productId: string;
  priceId: string;
  productName: string;
  createdProduct: boolean;
  createdPrice: boolean;
}

export async function setupAtomStripeCatalog(
  secretKey: string,
  options: { fetchImpl?: typeof fetch; apiBase?: string } = {},
): Promise<StripeCatalogSetupResult> {
  const clientOpts = { secretKey, ...options };

  const existing = await stripeRequest<StripeList<StripeProduct>>(
    clientOpts,
    "GET",
    "/products",
  );
  let product = existing.data.find(
    (p) =>
      p.name === ATOM_PRODUCT_NAME ||
      (p as StripeProduct & { metadata?: Record<string, string> }).metadata?.[
        ATOM_PRODUCT_METADATA_KEY
      ] === ATOM_PRODUCT_METADATA_VALUE,
  );
  let createdProduct = false;
  if (!product) {
    product = await stripeRequest<StripeProduct>(clientOpts, "POST", "/products", {
      name: ATOM_PRODUCT_NAME,
      [`metadata[${ATOM_PRODUCT_METADATA_KEY}]`]: ATOM_PRODUCT_METADATA_VALUE,
      "metadata[atom_rail]": "stripe",
    });
    createdProduct = true;
  }

  const prices = await stripeRequest<StripeList<StripePrice>>(
    clientOpts,
    "GET",
    "/prices",
    { product: product.id, active: true, limit: 10 },
  );
  let price = prices.data.find((p) => p.unit_amount === 100 && p.currency === "eur");
  let createdPrice = false;
  if (!price) {
    price = await stripeRequest<StripePrice>(clientOpts, "POST", "/prices", {
      product: product.id,
      unit_amount: 100,
      currency: "eur",
      "metadata[atom_catalog]": "placeholder-eur-1",
    });
    createdPrice = true;
  }

  return {
    productId: product.id,
    priceId: price.id,
    productName: product.name,
    createdProduct,
    createdPrice,
  };
}

async function main(): Promise<void> {
  const config = loadAgentBackendConfig();
  const secretKey = resolveStripeSecretKey(config.stripeSecretKey);
  const result = await setupAtomStripeCatalog(secretKey);

  console.log("Atom Stripe catalog ready.");
  console.log(`  Product: ${result.productName} (${result.productId})${result.createdProduct ? " [created]" : " [existing]"}`);
  console.log(`  Price:   ${result.priceId} (€1.00 placeholder)${result.createdPrice ? " [created]" : " [existing]"}`);
  console.log("");
  console.log("Add to agent-backend environment:");
  console.log(`  STRIPE_SECRET_KEY=sk_...`);
  console.log(`  ATOM_STRIPE_PRODUCT_ID=${result.productId}`);
  if (config.stripePublishableKey) {
    console.log(`  STRIPE_PUBLISHABLE_KEY=${config.stripePublishableKey.slice(0, 12)}...`);
  } else {
    console.log("  STRIPE_PUBLISHABLE_KEY=pk_...  (for shell Stripe.js)");
  }
  console.log("");
  console.log("Verify rail connectivity:");
  const rail = createStripePaymentRail(secretKey, { productId: result.productId });
  console.log(`  PaymentRail id: ${rail.id}`);
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === fileURLToPath(process.argv[1]);

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
