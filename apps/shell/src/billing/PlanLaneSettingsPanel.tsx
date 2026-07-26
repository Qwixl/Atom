/**
 * Renewal-gated Standard ↔ BYOK lane switch (D106) — calls Atom-MC schedule-lane.
 */
import { useEffect, useState } from "react";
import { CONTROL_PLANE_URL, isSupabaseConfigured } from "../hostConfig.js";
import { getSupabaseClient } from "../auth/hostedAccount.js";

type Lane = "standard" | "byok" | "self_hosted";

type CreditsSummary = {
  lane: Lane;
  pendingLane: Lane | null;
  balanceDisplay?: string;
  modelTierId?: string | null;
  speechEnabled?: boolean;
};

async function accountId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseClient().auth.getUser();
  return data.user?.id ?? null;
}

export function PlanLaneSettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const [summary, setSummary] = useState<CreditsSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function reload() {
    const base = CONTROL_PLANE_URL?.replace(/\/$/, "");
    const id = await accountId();
    if (!base || !id) return;
    try {
      const resp = await fetch(`${base}/billing/credits/${encodeURIComponent(id)}`);
      if (!resp.ok) return;
      const data = (await resp.json()) as { summary?: CreditsSummary };
      if (data.summary) setSummary(data.summary);
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function scheduleLane(pendingLane: "standard" | "byok") {
    const base = CONTROL_PLANE_URL?.replace(/\/$/, "");
    const id = await accountId();
    if (!base || !id) {
      setError("Sign in required to change plan lane.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const resp = await fetch(`${base}/billing/credits/schedule-lane`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id, pendingLane }),
      });
      const data = (await resp.json()) as {
        error?: string;
        summary?: CreditsSummary;
        account?: { pendingLane?: Lane | null };
      };
      if (!resp.ok) {
        setError(data.error || "Could not schedule lane change");
        return;
      }
      if (data.summary) setSummary(data.summary);
      setNote(
        `Lane change to ${pendingLane} scheduled for next renewal. Current lane stays until then.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function setSpeech(enabled: boolean) {
    const base = CONTROL_PLANE_URL?.replace(/\/$/, "");
    const id = await accountId();
    if (!base || !id) return;
    setBusy(true);
    try {
      const resp = await fetch(`${base}/billing/credits/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id, enabled }),
      });
      const data = (await resp.json()) as { summary?: CreditsSummary; error?: string };
      if (!resp.ok) {
        setError(data.error || "Could not update speech");
        return;
      }
      if (data.summary) setSummary(data.summary);
    } finally {
      setBusy(false);
    }
  }

  async function setTier(modelTierId: "efficient" | "balanced" | "maximum") {
    const base = CONTROL_PLANE_URL?.replace(/\/$/, "");
    const id = await accountId();
    if (!base || !id) return;
    setBusy(true);
    try {
      const resp = await fetch(`${base}/billing/credits/model-tier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id, modelTierId }),
      });
      const data = (await resp.json()) as { summary?: CreditsSummary; error?: string };
      if (!resp.ok) {
        setError(data.error || "Could not update model tier");
        return;
      }
      if (data.summary) setSummary(data.summary);
    } finally {
      setBusy(false);
    }
  }

  if (!summary) {
    return (
      <div className={embedded ? undefined : "settings-panel"}>
        <p className="settings-note">Atom Credits plan settings appear for hosted accounts.</p>
      </div>
    );
  }

  const otherLane: "standard" | "byok" | null =
    summary.lane === "standard" ? "byok" : summary.lane === "byok" ? "standard" : null;

  return (
    <div className={embedded ? undefined : "settings-panel"}>
      <p className="settings-note">
        Current lane: <strong>{summary.lane}</strong>
        {summary.balanceDisplay ? ` · ${summary.balanceDisplay}` : ""}
        {summary.pendingLane ? (
          <>
            {" "}
            · pending at renewal: <strong>{summary.pendingLane}</strong>
          </>
        ) : null}
      </p>

      {summary.lane === "standard" || summary.lane === "byok" ? (
        <>
          <label className="settings-note">
            <input
              type="checkbox"
              checked={Boolean(summary.speechEnabled)}
              disabled={busy}
              onChange={(e) => void setSpeech(e.target.checked)}
            />{" "}
            Agent speech (uses credits when on)
          </label>
        </>
      ) : null}

      {summary.lane === "standard" ? (
        <div className="settings-note" style={{ marginTop: 12 }}>
          <p>Model tier (mid-cycle; affects credit burn)</p>
          {(["efficient", "balanced", "maximum"] as const).map((tier) => (
            <label key={tier} style={{ display: "block" }}>
              <input
                type="radio"
                name="modelTier"
                checked={(summary.modelTierId ?? "balanced") === tier}
                disabled={busy}
                onChange={() => void setTier(tier)}
              />{" "}
              {tier === "efficient" ? "Efficient" : tier === "maximum" ? "Maximum" : "Balanced"}
            </label>
          ))}
        </div>
      ) : null}

      {otherLane ? (
        <div style={{ marginTop: 16 }}>
          <p className="settings-note">
            Switching Standard ↔ BYOK applies at <strong>next renewal</strong> (D106).
          </p>
          <button
            type="button"
            className="atom-btn atom-btn-secondary"
            disabled={busy || summary.pendingLane === otherLane}
            onClick={() => void scheduleLane(otherLane)}
          >
            Schedule switch to {otherLane === "standard" ? "Standard" : "BYOK"}
          </button>
        </div>
      ) : null}

      {note ? <p className="settings-note">{note}</p> : null}
      {error ? <p className="settings-note" style={{ color: "var(--atom-danger, #b00)" }}>{error}</p> : null}
    </div>
  );
}
