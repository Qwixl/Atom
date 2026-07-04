import type { Express } from "express";
import {
  createActionCapture,
  createActionHold,
  createActionReceipt,
  createActionRelease,
  type MonetaryAmount,
} from "@qwixl/a2a-transport";
import type { AgentKeyPair } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import { createStripePaymentRail, resolveStripeSecretKey } from "./payment/stripeRail.js";
import type { PaymentRail } from "./payment/types.js";

export interface PaymentAdminDeps {
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  stripeSecretKey: string | null;
  stripePublishableKey: string | null;
  stripeProductId: string | null;
  paymentRail?: PaymentRail;
}

interface PeerSendBody {
  peerUrl?: string;
  peerDid?: string;
  encrypt?: boolean;
  threadId?: string;
}

function parseAmount(body: {
  amountMinor?: number;
  currency?: string;
}): MonetaryAmount {
  if (typeof body.amountMinor !== "number" || !Number.isInteger(body.amountMinor)) {
    throw new Error("amountMinor must be an integer");
  }
  if (typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency)) {
    throw new Error("currency must be a 3-letter ISO code");
  }
  return { amountMinor: body.amountMinor, currency: body.currency.toUpperCase() };
}

function paymentRail(deps: PaymentAdminDeps, requestSecretKey?: string): PaymentRail {
  if (deps.paymentRail) return deps.paymentRail;
  const secretKey = resolveStripeSecretKey(deps.stripeSecretKey, requestSecretKey);
  return createStripePaymentRail(secretKey, {
    productId: deps.stripeProductId ?? undefined,
  });
}

export function registerPaymentAdminRoutes(adminApp: Express, deps: PaymentAdminDeps): void {
  adminApp.get("/payments/status", (_req, res) => {
    res.json({
      stripeConfigured: Boolean(deps.stripeSecretKey?.trim()),
      publishableKey: deps.stripePublishableKey?.trim() || null,
      productId: deps.stripeProductId?.trim() || null,
    });
  });

  adminApp.post("/payments/hold", async (req, res) => {
    const body = req.body as PeerSendBody & {
      transactionId?: string;
      attestationRef?: string;
      paymentMethodId?: string;
      customerId?: string;
      amountMinor?: number;
      currency?: string;
      subjectId?: string;
      label?: string;
      stripeSecretKey?: string;
    };
    if (!body.transactionId?.trim() || !body.attestationRef?.trim() || !body.paymentMethodId?.trim()) {
      res.status(400).json({
        error: "transactionId, attestationRef, and paymentMethodId required",
      });
      return;
    }
    try {
      const amount = parseAmount(body);
      const rail = paymentRail(deps, body.stripeSecretKey);
      const hold = await rail.placeHold({
        transactionId: body.transactionId.trim(),
        amount,
        paymentMethodId: body.paymentMethodId.trim(),
        customerId: body.customerId?.trim(),
        idempotencyKey: `hold-${body.transactionId.trim()}`,
      });

      const object = await createActionHold({
        identity: deps.identity,
        payload: {
          transactionId: body.transactionId.trim(),
          railRef: hold.railRef,
          rail: hold.rail,
          amount: hold.amount,
          attestationRef: body.attestationRef.trim(),
          subjectId: body.subjectId?.trim(),
          label: body.label?.trim(),
          peerDid: body.peerDid?.trim(),
          expiresAt: hold.expiresAt,
        },
      });

      if (body.peerUrl?.trim()) {
        const result = await deliverSignedObject({
          mlsStore: deps.mlsStore,
          peerUrl: body.peerUrl,
          peerDid: body.peerDid,
          object,
          encrypt: body.encrypt,
        });
        res.json({ hold, object, sent: { objectId: result.objectId, encrypted: result.encrypted } });
        return;
      }

      res.json({ hold, object });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/payments/capture", async (req, res) => {
    const body = req.body as PeerSendBody & {
      transactionId?: string;
      railRef?: string;
      attestationRef?: string;
      amountMinor?: number;
      currency?: string;
      subjectId?: string;
      label?: string;
      stripeSecretKey?: string;
    };
    if (!body.transactionId?.trim() || !body.railRef?.trim() || !body.attestationRef?.trim()) {
      res.status(400).json({ error: "transactionId, railRef, and attestationRef required" });
      return;
    }
    try {
      const rail = paymentRail(deps, body.stripeSecretKey);
      const amount =
        body.amountMinor !== undefined && body.currency
          ? parseAmount(body)
          : undefined;
      const captured = await rail.captureHold({
        railRef: body.railRef.trim(),
        amount,
        idempotencyKey: `capture-${body.transactionId.trim()}`,
      });

      const captureObject = await createActionCapture({
        identity: deps.identity,
        payload: {
          transactionId: body.transactionId.trim(),
          railRef: captured.railRef,
          amount: captured.amount,
          attestationRef: body.attestationRef.trim(),
          peerDid: body.peerDid?.trim(),
        },
      });

      const receiptObject = await createActionReceipt({
        identity: deps.identity,
        payload: {
          transactionId: body.transactionId.trim(),
          railRef: captured.railRef,
          amount: captured.amount,
          attestationRef: body.attestationRef.trim(),
          subjectId: body.subjectId?.trim(),
          label: body.label?.trim(),
          peerDid: body.peerDid?.trim(),
          capturedAt: captured.capturedAt,
        },
      });

      const objects = { capture: captureObject, receipt: receiptObject };

      if (body.peerUrl?.trim()) {
        const sentCapture = await deliverSignedObject({
          mlsStore: deps.mlsStore,
          peerUrl: body.peerUrl,
          peerDid: body.peerDid,
          object: captureObject,
          encrypt: body.encrypt,
        });
        const sentReceipt = await deliverSignedObject({
          mlsStore: deps.mlsStore,
          peerUrl: body.peerUrl,
          peerDid: body.peerDid,
          object: receiptObject,
          encrypt: body.encrypt,
        });
        res.json({
          captured,
          objects,
          sent: [
            { objectId: sentCapture.objectId, encrypted: sentCapture.encrypted },
            { objectId: sentReceipt.objectId, encrypted: sentReceipt.encrypted },
          ],
        });
        return;
      }

      res.json({ captured, objects });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/payments/release", async (req, res) => {
    const body = req.body as PeerSendBody & {
      transactionId?: string;
      railRef?: string;
      reason?: "declined" | "timeout" | "failure" | "cancelled";
      attestationRef?: string;
      note?: string;
      stripeSecretKey?: string;
    };
    if (!body.transactionId?.trim() || !body.railRef?.trim()) {
      res.status(400).json({ error: "transactionId and railRef required" });
      return;
    }
    try {
      const rail = paymentRail(deps, body.stripeSecretKey);
      const released = await rail.releaseHold({
        railRef: body.railRef.trim(),
        idempotencyKey: `release-${body.transactionId.trim()}`,
      });

      const object = await createActionRelease({
        identity: deps.identity,
        payload: {
          transactionId: body.transactionId.trim(),
          railRef: released.railRef,
          reason: body.reason ?? "cancelled",
          attestationRef: body.attestationRef?.trim(),
          note: body.note?.trim(),
        },
      });

      if (body.peerUrl?.trim()) {
        const result = await deliverSignedObject({
          mlsStore: deps.mlsStore,
          peerUrl: body.peerUrl,
          peerDid: body.peerDid,
          object,
          encrypt: body.encrypt,
        });
        res.json({ released, object, sent: { objectId: result.objectId, encrypted: result.encrypted } });
        return;
      }

      res.json({ released, object });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
