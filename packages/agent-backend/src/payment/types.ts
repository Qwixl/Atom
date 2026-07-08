import type { MonetaryAmount } from "@qwixl/a2a-transport";

/** Result of placing an authorization hold on a payment rail. */
export interface PaymentHoldResult {
  rail: string;
  railRef: string;
  amount: MonetaryAmount;
  status: "requires_capture" | "processing" | "requires_action";
  expiresAt?: string;
  clientSecret?: string;
}

export interface PaymentCaptureResult {
  railRef: string;
  amount: MonetaryAmount;
  capturedAt: string;
  status: "succeeded";
}

export interface PaymentReleaseResult {
  railRef: string;
  status: "canceled";
  releasedAt: string;
}

export interface PaymentHoldRequest {
  transactionId: string;
  amount: MonetaryAmount;
  /** Payment method id from Stripe.js / Elements (owner confirmed in shell chrome). */
  paymentMethodId: string;
  customerId?: string;
  /** Stripe Connect destination account for split payments. */
  connectAccountId?: string;
  /** Platform fee in minor units (application_fee_amount). 0 during beta. */
  applicationFeeMinor?: number;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface PaymentCaptureRequest {
  railRef: string;
  amount?: MonetaryAmount;
  idempotencyKey?: string;
}

export interface PaymentReleaseRequest {
  railRef: string;
  idempotencyKey?: string;
}

/**
 * Pluggable payment rail for M11 ring-fence (authorization hold → capture/release).
 * Precedent: Stripe PaymentIntent manual capture (card auth hold).
 */
export interface PaymentRail {
  readonly id: string;
  placeHold(request: PaymentHoldRequest): Promise<PaymentHoldResult>;
  captureHold(request: PaymentCaptureRequest): Promise<PaymentCaptureResult>;
  releaseHold(request: PaymentReleaseRequest): Promise<PaymentReleaseResult>;
}

export function assertMonetaryAmount(amount: MonetaryAmount): void {
  if (!/^[A-Z]{3}$/.test(amount.currency)) {
    throw new Error("amount.currency must be an ISO 4217 code");
  }
  if (!Number.isInteger(amount.amountMinor) || amount.amountMinor <= 0) {
    throw new Error("amount.amountMinor must be a positive integer");
  }
}
