import { useCallback, useEffect, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";

type SpendCategory = "commerce" | "llm_inference" | "embedding" | "module_store";

interface SpendPolicy {
  workspaceId: string;
  currency: string;
  monthlyBudgetMinor: number;
  perTransactionCeilingMinor: number;
  allowedCategories: SpendCategory[];
  chromeApprovalThresholdMinor: number;
  updatedAt: string;
}

function minorToMajor(minor: number): string {
  return (Math.max(0, minor) / 100).toFixed(2);
}

function majorToMinor(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function SpendPolicySettingsPanel({
  workspaceId,
  vaultUnlocked = true,
  embedded = false,
}: {
  workspaceId: string;
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { client } = useAgentConfig(vaultUnlocked);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<{
    betaFree: boolean;
    platformFeeBps: number;
    stripeConfigured: boolean;
  } | null>(null);
  const [monthSpentMinor, setMonthSpentMinor] = useState(0);
  const [currency, setCurrency] = useState("EUR");
  const [monthlyBudget, setMonthlyBudget] = useState("0");
  const [perTxCeiling, setPerTxCeiling] = useState("0");
  const [chromeThreshold, setChromeThreshold] = useState("50.00");
  const [allowCommerce, setAllowCommerce] = useState(true);
  const [allowLlm, setAllowLlm] = useState(true);
  const [allowEmbedding, setAllowEmbedding] = useState(true);

  const refresh = useCallback(async () => {
    if (!vaultUnlocked) return;
    setBusy(true);
    setNote(null);
    try {
      const [status, policyRes, ledger] = await Promise.all([
        client.billingStatus(),
        client.getSpendPolicy(workspaceId),
        client.billingLedger(workspaceId),
      ]);
      setBillingStatus(status);
      const policy = policyRes.policy;
      setCurrency(policy.currency || "EUR");
      setMonthlyBudget(minorToMajor(policy.monthlyBudgetMinor));
      setPerTxCeiling(minorToMajor(policy.perTransactionCeilingMinor));
      setChromeThreshold(minorToMajor(policy.chromeApprovalThresholdMinor));
      setAllowCommerce(policy.allowedCategories.includes("commerce"));
      setAllowLlm(policy.allowedCategories.includes("llm_inference"));
      setAllowEmbedding(policy.allowedCategories.includes("embedding"));
      const month = new Date().toISOString().slice(0, 7);
      const spent = (ledger.entries ?? [])
        .filter(
          (entry) =>
            entry.currency.toUpperCase() === (policy.currency || "EUR").toUpperCase() &&
            entry.recordedAt.startsWith(month),
        )
        .reduce((sum, entry) => sum + entry.amountMinor, 0);
      setMonthSpentMinor(spent);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [client, vaultUnlocked, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    setBusy(true);
    setNote("Saving spend policy…");
    try {
      const allowedCategories: SpendCategory[] = [];
      if (allowCommerce) allowedCategories.push("commerce");
      if (allowLlm) allowedCategories.push("llm_inference");
      if (allowEmbedding) allowedCategories.push("embedding");
      await client.saveSpendPolicy({
        workspaceId,
        currency: currency.trim().toUpperCase() || "EUR",
        monthlyBudgetMinor: majorToMinor(monthlyBudget),
        perTransactionCeilingMinor: majorToMinor(perTxCeiling),
        chromeApprovalThresholdMinor: majorToMinor(chromeThreshold),
        allowedCategories,
      });
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  return (
    <section className={embedded ? "connectors-subpanel" : "connectors-panel"}>
      <header>
        <h3>Spend policy</h3>
        <p>
          Caps for commerce holds and estimated LLM usage on this workspace. 0 = unlimited. Agent never
          sees your card — only these limits.
        </p>
      </header>
      {billingStatus ? (
        <p className="connectors-hint">
          Platform fee: {(billingStatus.platformFeeBps / 100).toFixed(2)}%
          {billingStatus.betaFree ? " (beta-free)" : ""}. Stripe on agent:{" "}
          {billingStatus.stripeConfigured ? "configured" : "not configured"}. This month spent:{" "}
          {minorToMajor(monthSpentMinor)} {currency}.
        </p>
      ) : null}
      <div className="connectors-token-actions" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <label className="atom-field">
          <span className="atom-field-label">Currency</span>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={busy || !vaultUnlocked} />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Monthly budget (major units)</span>
          <input value={monthlyBudget} onChange={(e) => setMonthlyBudget(e.target.value)} disabled={busy || !vaultUnlocked} />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Per-transaction ceiling</span>
          <input value={perTxCeiling} onChange={(e) => setPerTxCeiling(e.target.value)} disabled={busy || !vaultUnlocked} />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Chrome approval threshold</span>
          <input
            value={chromeThreshold}
            onChange={(e) => setChromeThreshold(e.target.value)}
            disabled={busy || !vaultUnlocked}
          />
        </label>
        <label>
          <input type="checkbox" checked={allowCommerce} onChange={(e) => setAllowCommerce(e.target.checked)} disabled={busy} />{" "}
          Allow commerce
        </label>
        <label>
          <input type="checkbox" checked={allowLlm} onChange={(e) => setAllowLlm(e.target.checked)} disabled={busy} /> Allow
          LLM inference
        </label>
        <label>
          <input
            type="checkbox"
            checked={allowEmbedding}
            onChange={(e) => setAllowEmbedding(e.target.checked)}
            disabled={busy}
          />{" "}
          Allow embeddings
        </label>
        <button type="button" disabled={busy || !vaultUnlocked} onClick={() => void save()}>
          Save spend policy
        </button>
      </div>
      {note ? <p className="connectors-note">{note}</p> : null}
    </section>
  );
}
