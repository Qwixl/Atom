import type { MonetaryAmount } from "@qwixl/a2a-transport";
import {
  encodeStripeMetadata,
  encodeStripeParams,
  stripeRequest,
  type StripeClientOptions,
  type StripePaymentIntent,
} from "./stripeClient.js";
import {
  assertMonetaryAmount,
  type PaymentCaptureRequest,
  type PaymentCaptureResult,
  type PaymentHoldRequest,
  type PaymentHoldResult,
  type PaymentRail,
  type PaymentReleaseRequest,
  type PaymentReleaseResult,
} from "./types.js";

const DEFAULT_HOLD_DAYS = 7;

function mapHoldStatus(
  status: string,
): PaymentHoldResult["status"] {
  if (status === "requires_capture") return "requires_capture";
  if (status === "requires_action") return "requires_action";
  return "processing";
}

function holdExpiryIso(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + DEFAULT_HOLD_DAYS);
  return expires.toISOString();
}

export interface StripePaymentRailOptions extends StripeClientOptions {
  /** Optional Stripe Product id for dashboard grouping (from setup script). */
  productId?: string;
}

/**
 * Stripe PaymentIntent adapter with manual capture (authorization hold).
 * Precedent: card-network auth hold — funds ring-fenced, capture on mutual confirm.
 */
export class StripePaymentRail implements PaymentRail {
  readonly id = "stripe";

  constructor(private readonly options: StripePaymentRailOptions) {}

  async placeHold(request: PaymentHoldRequest): Promise<PaymentHoldResult> {
    assertMonetaryAmount(request.amount);
    const params: Record<string, string | number | boolean> = {
      amount: request.amount.amountMinor,
      currency: request.amount.currency.toLowerCase(),
      capture_method: "manual",
      confirm: true,
      payment_method: request.paymentMethodId,
      "automatic_payment_methods[enabled]": false,
    };
    if (request.customerId) params.customer = request.customerId;

    const metadata: Record<string, string> = {
      transaction_id: request.transactionId,
      atom_rail: "stripe",
      ...(request.metadata ?? {}),
    };
    if (this.options.productId) metadata.atom_product_id = this.options.productId;

    const body = `${encodeStripeParams(params)}&${encodeStripeMetadata(metadata)}`;
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.options.apiBase ?? "https://api.stripe.com/v1"}/payment_intents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(request.idempotencyKey ? { "Idempotency-Key": request.idempotencyKey } : {}),
      },
      body,
    });
    const intent = (await response.json()) as StripePaymentIntent & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(intent.error?.message ?? `Stripe hold failed (${response.status})`);
    }

    return {
      rail: this.id,
      railRef: intent.id,
      amount: request.amount,
      status: mapHoldStatus(intent.status),
      expiresAt: holdExpiryIso(),
      clientSecret: intent.client_secret,
    };
  }

  async captureHold(request: PaymentCaptureRequest): Promise<PaymentCaptureResult> {
    const params: Record<string, string | number> = {};
    if (request.amount) {
      assertMonetaryAmount(request.amount);
      params.amount_to_capture = request.amount.amountMinor;
    }
    const intent = await stripeRequest<StripePaymentIntent>(
      this.options,
      "POST",
      `/payment_intents/${encodeURIComponent(request.railRef)}/capture`,
      params,
      request.idempotencyKey ? { "Idempotency-Key": request.idempotencyKey } : undefined,
    );
    if (intent.status !== "succeeded") {
      throw new Error(`Capture did not succeed (status=${intent.status})`);
    }
    return {
      railRef: intent.id,
      amount: {
        currency: intent.currency.toUpperCase(),
        amountMinor: intent.amount,
      },
      capturedAt: new Date().toISOString(),
      status: "succeeded",
    };
  }

  async releaseHold(request: PaymentReleaseRequest): Promise<PaymentReleaseResult> {
    const intent = await stripeRequest<StripePaymentIntent>(
      this.options,
      "POST",
      `/payment_intents/${encodeURIComponent(request.railRef)}/cancel`,
      {},
      request.idempotencyKey ? { "Idempotency-Key": request.idempotencyKey } : undefined,
    );
    if (intent.status !== "canceled") {
      throw new Error(`Release did not cancel intent (status=${intent.status})`);
    }
    return {
      railRef: intent.id,
      status: "canceled",
      releasedAt: new Date(
        intent.canceled_at ? intent.canceled_at * 1000 : Date.now(),
      ).toISOString(),
    };
  }
}

export function resolveStripeSecretKey(
  envToken: string | null | undefined,
  requestToken?: string,
): string {
  const token = requestToken?.trim() || envToken?.trim();
  if (!token) {
    throw new Error(
      "Stripe secret key not configured (set STRIPE_SECRET_KEY or pass stripeSecretKey)",
    );
  }
  return token;
}

export function createStripePaymentRail(
  secretKey: string,
  options: Omit<StripePaymentRailOptions, "secretKey"> = {},
): StripePaymentRail {
  return new StripePaymentRail({ secretKey, ...options });
}

export function monetaryAmountFromIntent(intent: StripePaymentIntent): MonetaryAmount {
  return {
    currency: intent.currency.toUpperCase(),
    amountMinor: intent.amount,
  };
}
