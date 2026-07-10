import type { Express } from "express";
import type { AuthenticatedRequest } from "./adminAuth.js";
import { BudgetLedgerStore } from "./budgetLedger.js";
import { defaultSpendPolicy, spendPolicyAllows, type SpendCategory, type SpendPolicy } from "./spendPolicy.js";
import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "./dataDir.js";

const POLICIES_FILE = "spend-policies.json";

export interface BillingAdminDeps {
  budgetLedger: BudgetLedgerStore;
  stripeSecretKey?: string | null;
  /** Platform fee in basis points during beta (0 = no fee). */
  platformFeeBps?: number;
  /** Agent Brain always-on heartbeat (D078 / BK-45). */
  brainAlwaysOn?: boolean;
  /** Beta: hosting fees waived (published model — no rug-pull). */
  betaFree?: boolean;
}

function readPolicies(): Record<string, SpendPolicy> {
  const filePath = resolveDataPath(POLICIES_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, SpendPolicy>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePolicies(policies: Record<string, SpendPolicy>): void {
  const filePath = resolveDataPath(POLICIES_FILE);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(policies, null, 2)}\n`, "utf8");
}

export function getSpendPolicy(workspaceId: string): SpendPolicy {
  const policies = readPolicies();
  return policies[workspaceId] ?? defaultSpendPolicy(workspaceId);
}

export function setSpendPolicy(policy: SpendPolicy): SpendPolicy {
  const policies = readPolicies();
  const next = { ...policy, updatedAt: new Date().toISOString() };
  policies[policy.workspaceId] = next;
  writePolicies(policies);
  return next;
}

export function evaluateSpend(
  deps: BillingAdminDeps,
  input: { workspaceId: string; category: SpendCategory; amountMinor: number; currency: string },
): { allowed: boolean; reason?: string; requiresChrome: boolean; monthSpentMinor: number } {
  const policy = getSpendPolicy(input.workspaceId);
  const monthSpentMinor = deps.budgetLedger.monthSpentMinor(input.workspaceId, input.currency);
  const verdict = spendPolicyAllows(policy, input.category, input.amountMinor, monthSpentMinor);
  return { ...verdict, monthSpentMinor };
}

export function registerBillingAdminRoutes(app: Express, deps: BillingAdminDeps): void {
  app.get("/billing/status", (_req, res) => {
    const betaFree = deps.betaFree !== false;
    res.json({
      betaFree,
      platformFeeBps: deps.platformFeeBps ?? 0,
      stripeConfigured: Boolean(deps.stripeSecretKey?.trim()),
      connectOnboarding: "workspace-scoped",
      alwaysOnBrain: deps.brainAlwaysOn !== false,
      alwaysOnBrainTier: betaFree
        ? "beta"
        : deps.brainAlwaysOn !== false
          ? "subscribed"
          : "duty-cycled",
    });
  });

  app.get("/billing/spend-policy/:workspaceId", (req, res) => {
    const workspaceId = String(req.params.workspaceId ?? "").trim();
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    res.json({ policy: getSpendPolicy(workspaceId) });
  });

  app.post("/billing/spend-policy", (req, res) => {
    const body = req.body as Partial<SpendPolicy>;
    const workspaceId = body.workspaceId?.trim();
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const current = getSpendPolicy(workspaceId);
    const policy = setSpendPolicy({
      ...current,
      ...body,
      workspaceId,
      allowedCategories: Array.isArray(body.allowedCategories)
        ? (body.allowedCategories as SpendCategory[])
        : current.allowedCategories,
    });
    res.json({ policy });
  });

  app.post("/billing/evaluate-spend", (req, res) => {
    const body = req.body as {
      workspaceId?: string;
      category?: SpendCategory;
      amountMinor?: number;
      currency?: string;
    };
    const workspaceId = body.workspaceId?.trim();
    const category = body.category;
    const amountMinor = Number(body.amountMinor ?? 0);
    const currency = body.currency?.trim() || "EUR";
    if (!workspaceId || !category || !Number.isFinite(amountMinor)) {
      res.status(400).json({ error: "workspaceId, category, amountMinor required" });
      return;
    }
    res.json(evaluateSpend(deps, { workspaceId, category, amountMinor, currency }));
  });

  app.get("/billing/ledger/:workspaceId", (req, res) => {
    const workspaceId = String(req.params.workspaceId ?? "").trim();
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    res.json({ entries: deps.budgetLedger.list(workspaceId) });
  });

  /** Stripe Connect onboarding URL placeholder — wired when workspace billing ships. */
  app.post("/billing/connect/onboard", (req, res) => {
    const workspaceId = (req.body as { workspaceId?: string }).workspaceId?.trim();
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    if (!deps.stripeSecretKey?.trim()) {
      res.status(503).json({ error: "Stripe not configured on agent backend" });
      return;
    }
    res.json({
      workspaceId,
      status: "pending_implementation",
      message: "Connect Express onboarding will return accountLink.url when billing exits beta.",
    });
  });

  /** Always-on Agent Brain subscription — charged at beta exit (D078 / Q13). */
  app.post("/billing/hosting/subscribe", (req, res) => {
    const workspaceId = (req.body as { workspaceId?: string }).workspaceId?.trim();
    if (!workspaceId) {
      res.status(400).json({ error: "workspaceId required" });
      return;
    }
    const betaFree = deps.betaFree !== false;
    if (betaFree) {
      res.json({
        workspaceId,
        status: "beta_included",
        alwaysOnBrain: true,
        message: "Always-on Agent Brain is included during beta. Pricing will be published before charges begin.",
      });
      return;
    }
    if (!deps.stripeSecretKey?.trim()) {
      res.status(503).json({ error: "Stripe not configured on agent backend" });
      return;
    }
    res.json({
      workspaceId,
      status: "pending_implementation",
      message:
        "Always-on subscription Checkout Session will return when Q13 pricing ships and beta exits.",
    });
  });
}

export function recordSpendIfAllowed(
  deps: BillingAdminDeps,
  input: {
    workspaceId: string;
    category: SpendCategory;
    amountMinor: number;
    currency: string;
    description: string;
  },
): { ok: boolean; reason?: string } {
  const verdict = evaluateSpend(deps, input);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason };
  deps.budgetLedger.append({
    workspaceId: input.workspaceId,
    category: input.category,
    amountMinor: input.amountMinor,
    currency: input.currency,
    description: input.description,
  });
  return { ok: true };
}
