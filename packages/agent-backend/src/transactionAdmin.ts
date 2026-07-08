import type { Express } from "express";
import type { MonetaryAmount } from "@qwixl/a2a-transport";
import type { PaymentRail } from "./payment/types.js";
import { createStripePaymentRail, resolveStripeSecretKey } from "./payment/stripeRail.js";
import type { TransactionCommitStore } from "./transactionCommitStore.js";

export interface TransactionAdminDeps {
  stripeSecretKey: string | null;
  stripeProductId: string | null;
  paymentRail?: PaymentRail;
  store: TransactionCommitStore;
  /** Optional spend-policy gate (D066). When set, commerce holds are checked before rail.placeHold. */
  evaluateCommerceSpend?: (input: {
    amountMinor: number;
    currency: string;
  }) => { allowed: boolean; reason?: string; requiresChrome: boolean };
  /** Platform application fee in minor units (0 during beta). */
  applicationFeeMinor?: number;
  /** Stripe Connect destination for business workspace. */
  connectAccountId?: string | null;
  /** Workspace id for budget ledger (defaults to "personal"). */
  workspaceId?: string;
  recordCommerceSpend?: (input: {
    amountMinor: number;
    currency: string;
    description: string;
  }) => void;
}

interface PeerSendBody {
  peerUrl?: string;
  peerDid?: string;
  encrypt?: boolean;
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

function resolveRail(deps: TransactionAdminDeps, requestSecretKey?: string): PaymentRail {
  if (deps.paymentRail) return deps.paymentRail;
  const secretKey = resolveStripeSecretKey(deps.stripeSecretKey, requestSecretKey);
  return createStripePaymentRail(secretKey, {
    productId: deps.stripeProductId ?? undefined,
  });
}

export function registerTransactionAdminRoutes(adminApp: Express, deps: TransactionAdminDeps): void {
  adminApp.get("/transactions", async (_req, res) => {
    try {
      await deps.store.sweepExpired();
      res.json({ transactions: deps.store.list() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.get("/transactions/:transactionId", async (req, res) => {
    try {
      await deps.store.sweepExpired();
      const record = deps.store.get(req.params.transactionId);
      if (!record) {
        res.status(404).json({ error: "Transaction not found" });
        return;
      }
      res.json({ transaction: record });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/transactions/offer", async (req, res) => {
    const body = req.body as PeerSendBody & {
      transactionId?: string;
      attestationRef?: string;
      paymentMethodId?: string;
      amountMinor?: number;
      currency?: string;
      label?: string;
      subjectId?: string;
      stripeSecretKey?: string;
    };
    if (
      !body.transactionId?.trim() ||
      !body.attestationRef?.trim() ||
      !body.paymentMethodId?.trim() ||
      !body.peerUrl?.trim()
    ) {
      res.status(400).json({
        error: "transactionId, attestationRef, paymentMethodId, and peerUrl required",
      });
      return;
    }
    try {
      const amount = parseAmount(body);
      if (deps.evaluateCommerceSpend) {
        const verdict = deps.evaluateCommerceSpend({
          amountMinor: amount.amountMinor,
          currency: amount.currency,
        });
        if (!verdict.allowed) {
          res.status(402).json({ error: verdict.reason ?? "Spend policy blocked this hold" });
          return;
        }
      }
      resolveRail(deps, body.stripeSecretKey);
      const transaction = await deps.store.offerHold({
        transactionId: body.transactionId.trim(),
        peerUrl: body.peerUrl.trim(),
        peerDid: body.peerDid?.trim(),
        attestationRef: body.attestationRef.trim(),
        paymentMethodId: body.paymentMethodId.trim(),
        amount,
        label: body.label?.trim(),
        subjectId: body.subjectId?.trim(),
        encrypt: body.encrypt,
        applicationFeeMinor: deps.applicationFeeMinor,
        connectAccountId: deps.connectAccountId ?? undefined,
      });
      deps.recordCommerceSpend?.({
        amountMinor: amount.amountMinor,
        currency: amount.currency,
        description: `commerce hold ${body.transactionId.trim()}`,
      });
      res.json({ transaction });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/transactions/confirm", async (req, res) => {
    const body = req.body as PeerSendBody & {
      transactionId?: string;
      attestationRef?: string;
    };
    if (!body.transactionId?.trim() || !body.attestationRef?.trim()) {
      res.status(400).json({ error: "transactionId and attestationRef required" });
      return;
    }
    try {
      const transaction = await deps.store.confirmLocal({
        transactionId: body.transactionId.trim(),
        attestationRef: body.attestationRef.trim(),
        peerUrl: body.peerUrl?.trim(),
        peerDid: body.peerDid?.trim(),
        encrypt: body.encrypt,
      });
      res.json({ transaction });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  adminApp.post("/transactions/decline", async (req, res) => {
    const body = req.body as PeerSendBody & {
      transactionId?: string;
      attestationRef?: string;
      note?: string;
    };
    if (!body.transactionId?.trim()) {
      res.status(400).json({ error: "transactionId required" });
      return;
    }
    try {
      const transaction = await deps.store.declineLocal({
        transactionId: body.transactionId.trim(),
        attestationRef: body.attestationRef?.trim(),
        note: body.note?.trim(),
        peerUrl: body.peerUrl?.trim(),
        peerDid: body.peerDid?.trim(),
        encrypt: body.encrypt,
      });
      res.json({ transaction });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
