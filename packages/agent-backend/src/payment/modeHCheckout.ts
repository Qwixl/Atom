/**
 * BUS-01 Mode H — create Stripe Checkout Session on connected merchant account.
 * Direct charge via Stripe-Account header; no application_fee_amount.
 */
import { stripeRequest } from "./stripeClient.js";

export interface ModeHCheckoutParams {
  secretKey: string;
  /** Connected account id (`acct_…`). */
  stripeAccountId: string;
  offerId: string;
  intentId: string;
  label: string;
  amountMinor: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds — Session expires_at (≤ optionExpiresAt). */
  expiresAtUnix: number;
  fetchImpl?: typeof fetch;
}

export interface ModeHCheckoutResult {
  sessionId: string;
  url: string;
  expiresAtUnix: number;
}

export async function createModeHCheckoutSession(
  params: ModeHCheckoutParams,
): Promise<ModeHCheckoutResult> {
  if (!params.stripeAccountId.startsWith("acct_")) {
    throw new Error("stripeAccountId must be a Connect account id");
  }
  if (params.expiresAtUnix <= Math.floor(Date.now() / 1000) + 30) {
    throw new Error("Checkout Session expiresAt must be in the future");
  }
  // Stripe Checkout Session max expiry is 24h from creation for many configs;
  // clamp to min(requested, now+24h-60s).
  const maxExpiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60 - 60;
  const expiresAt = Math.min(params.expiresAtUnix, maxExpiry);

  const session = await stripeRequest<{
    id: string;
    url: string | null;
    expires_at: number;
  }>(
    { secretKey: params.secretKey, fetchImpl: params.fetchImpl },
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.offerId,
      expires_at: expiresAt,
      "line_items[0][price_data][currency]": params.currency.toLowerCase(),
      "line_items[0][price_data][product_data][name]": params.label,
      "line_items[0][price_data][unit_amount]": params.amountMinor,
      "line_items[0][quantity]": 1,
      "metadata[offerId]": params.offerId,
      "metadata[intentId]": params.intentId,
      "metadata[settlementMode]": "merchant-checkout",
      // Prefer card + Link; wallets follow Stripe Dashboard / country support.
      "payment_method_types[0]": "card",
      "payment_method_types[1]": "link",
    },
    { "Stripe-Account": params.stripeAccountId },
  );

  if (!session.url) {
    throw new Error("Stripe Checkout Session missing url");
  }
  return {
    sessionId: session.id,
    url: session.url,
    expiresAtUnix: session.expires_at,
  };
}
