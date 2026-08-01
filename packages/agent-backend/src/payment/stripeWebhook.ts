/**
 * BUS-01 — Stripe webhook signature verify + Checkout paid → Mode H outcome.
 * No Stripe SDK; HMAC-SHA256 per Stripe docs.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import express from "express";

export interface StripeCheckoutSessionObject {
  id: string;
  object?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  payment_intent?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  status?: string;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeCheckoutSessionObject };
}

export function verifyStripeWebhookSignature(
  payload: Buffer,
  signatureHeader: string,
  secret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const parts = signatureHeader.split(",").map((p) => p.trim());
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v ?? "";
    if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;

  const signed = `${timestamp}.${payload.toString("utf8")}`;
  const expected = createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  for (const sig of signatures) {
    const got = Buffer.from(sig, "utf8");
    if (got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)) {
      return true;
    }
  }
  return false;
}

export function checkoutSessionIsPaid(session: StripeCheckoutSessionObject): boolean {
  return session.payment_status === "paid";
}

export function paymentIntentIdFromSession(
  session: StripeCheckoutSessionObject,
): string | undefined {
  const pi = session.payment_intent;
  if (typeof pi === "string" && pi.startsWith("pi_")) return pi;
  if (pi && typeof pi === "object" && typeof pi.id === "string" && pi.id.startsWith("pi_")) {
    return pi.id;
  }
  return undefined;
}

const PAID_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export interface ModeHWebhookDeps {
  webhookSecret: string | null;
  /** Optional IP rate limit (7A — after cheap reject, before HMAC). */
  assertWebhookIpAllowed?: (ip: string) => void;
  onCheckoutPaid: (input: {
    eventId: string;
    session: StripeCheckoutSessionObject;
  }) => Promise<{ status: "minted" | "duplicate" | "ignored"; detail?: string }>;
}

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Register public Stripe webhook (no admin auth). Must use raw body.
 * Pipeline 7A: cheap reject → IP rate limit → HMAC.
 */
export function registerStripeModeHWebhook(app: Express, deps: ModeHWebhookDeps): void {
  app.post(
    "/billing/stripe/webhook",
    express.raw({ type: "application/json", limit: "256kb" }),
    async (req: Request, res: Response) => {
      const secret = deps.webhookSecret?.trim();
      if (!secret) {
        res.status(503).json({ error: "Stripe webhook secret not configured" });
        return;
      }
      const signature = req.headers["stripe-signature"];
      // Cheap reject before rate limit / HMAC.
      if (typeof signature !== "string" || !signature.includes("t=") || !signature.includes("v1=")) {
        res.status(400).json({ error: "Missing or malformed Stripe-Signature" });
        return;
      }
      const raw = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === "string" ? req.body : "", "utf8");
      if (raw.byteLength === 0 || raw.byteLength > 256 * 1024) {
        res.status(400).json({ error: "Invalid body size" });
        return;
      }

      try {
        deps.assertWebhookIpAllowed?.(clientIp(req));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Webhook rate limited";
        const status =
          error instanceof Error &&
          "code" in error &&
          (error as { code?: string }).code === "abuse_store"
            ? 503
            : 429;
        res.status(status).json({ error: message });
        return;
      }

      if (!verifyStripeWebhookSignature(raw, signature, secret)) {
        res.status(400).json({ error: "Invalid Stripe signature" });
        return;
      }

      let event: StripeEvent;
      try {
        event = JSON.parse(raw.toString("utf8")) as StripeEvent;
      } catch {
        res.status(400).json({ error: "Invalid JSON" });
        return;
      }

      if (!PAID_EVENT_TYPES.has(event.type)) {
        res.json({ received: true, ignored: event.type });
        return;
      }

      const session = event.data?.object;
      if (!session?.id || !session.id.startsWith("cs_")) {
        res.status(400).json({ error: "Expected Checkout Session object" });
        return;
      }
      if (!checkoutSessionIsPaid(session)) {
        res.json({ received: true, ignored: "not_paid", payment_status: session.payment_status });
        return;
      }

      try {
        const result = await deps.onCheckoutPaid({ eventId: event.id, session });
        res.json({ received: true, ...result });
      } catch (error) {
        console.warn(
          `[mode-h-webhook] mint failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        res.status(500).json({
          error: error instanceof Error ? error.message : "Outcome mint failed",
        });
      }
    },
  );
}
