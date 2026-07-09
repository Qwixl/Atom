import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";
import { useDirtyForm } from "../ui/useDirtyForm.js";

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
  const [policyLoaded, setPolicyLoaded] = useState(false);

  const spendForm = useMemo(
    () => ({
      currency: currency.trim().toUpperCase(),
      monthlyBudget,
      perTxCeiling,
      chromeThreshold,
      allowCommerce,
      allowLlm,
      allowEmbedding,
    }),
    [currency, monthlyBudget, perTxCeiling, chromeThreshold, allowCommerce, allowLlm, allowEmbedding],
  );
  const { dirty: spendDirty, markClean: markSpendClean } = useDirtyForm(spendForm);

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
      const nextCurrency = policy.currency || "EUR";
      const nextMonthly = minorToMajor(policy.monthlyBudgetMinor);
      const nextCeiling = minorToMajor(policy.perTransactionCeilingMinor);
      const nextChrome = minorToMajor(policy.chromeApprovalThresholdMinor);
      const nextCommerce = policy.allowedCategories.includes("commerce");
      const nextLlm = policy.allowedCategories.includes("llm_inference");
      const nextEmbedding = policy.allowedCategories.includes("embedding");
      setCurrency(nextCurrency);
      setMonthlyBudget(nextMonthly);
      setPerTxCeiling(nextCeiling);
      setChromeThreshold(nextChrome);
      setAllowCommerce(nextCommerce);
      setAllowLlm(nextLlm);
      setAllowEmbedding(nextEmbedding);
      markSpendClean({
        currency: nextCurrency.trim().toUpperCase(),
        monthlyBudget: nextMonthly,
        perTxCeiling: nextCeiling,
        chromeThreshold: nextChrome,
        allowCommerce: nextCommerce,
        allowLlm: nextLlm,
        allowEmbedding: nextEmbedding,
      });
      setPolicyLoaded(true);
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
  }, [client, vaultUnlocked, workspaceId, markSpendClean]);

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
      markSpendClean(spendForm);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  return (
    <section className={embedded ? "settings-subpanel" : "settings-panel"}>
      <header className="settings-panel-head">
        <h3>Spending limits</h3>
        <p className="settings-panel-desc">
          Cap how much your agent can spend. Use 0 for no limit.
        </p>
        <p className="settings-note">
          Actual payment happens in-person between you and the merchant.
        </p>
      </header>
      {billingStatus ? (
        <p className="settings-note">
          {billingStatus.betaFree ? "Beta — no platform fee. " : `Platform fee ${(billingStatus.platformFeeBps / 100).toFixed(2)}%. `}
          Spent this month: {minorToMajor(monthSpentMinor)} {currency}.
          {billingStatus.stripeConfigured ? "" : " Payment connection not set up yet."}
        </p>
      ) : null}
      <div className="settings-panel-fields">
        <div className="connector-form-grid">
          <label className="atom-field">
            <span className="atom-field-label">Currency</span>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={busy || !vaultUnlocked} />
          </label>
          <label className="atom-field">
            <span className="atom-field-label">Monthly budget</span>
            <input value={monthlyBudget} onChange={(e) => setMonthlyBudget(e.target.value)} disabled={busy || !vaultUnlocked} />
          </label>
          <label className="atom-field">
            <span className="atom-field-label">Max per purchase</span>
            <input value={perTxCeiling} onChange={(e) => setPerTxCeiling(e.target.value)} disabled={busy || !vaultUnlocked} />
          </label>
          <label className="atom-field">
            <span className="atom-field-label">Ask before spending above</span>
            <input
              value={chromeThreshold}
              onChange={(e) => setChromeThreshold(e.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
        </div>
        <ul className="settings-checkbox-list">
          <li>
            <SettingsToggle
              checked={allowCommerce}
              disabled={busy}
              label="Allow purchases"
              onChange={setAllowCommerce}
            />
          </li>
          <li>
            <SettingsToggle
              checked={allowLlm}
              disabled={busy}
              label="Allow AI usage charges"
              onChange={setAllowLlm}
            />
          </li>
          <li>
            <SettingsToggle
              checked={allowEmbedding}
              disabled={busy}
              label="Allow search-index charges"
              onChange={setAllowEmbedding}
            />
          </li>
        </ul>
        <div className="chrome-actions settings-section-actions">
          <button
            type="button"
            className="chrome-approve"
            disabled={busy || !vaultUnlocked || !policyLoaded || !spendDirty}
            onClick={() => void save()}
          >
            Save spending limits
          </button>
        </div>
      </div>
      {note ? <p className="settings-note">{note}</p> : null}
    </section>
  );
}
