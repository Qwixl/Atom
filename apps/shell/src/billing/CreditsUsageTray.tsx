import { useEffect, useState } from "react";
import { getSupabaseClient } from "../auth/hostedAccount.js";
import { CONTROL_PLANE_URL, isSupabaseConfigured } from "../hostConfig.js";
import { controlPlaneAuthHeaders } from "./controlPlaneAuth.js";
import "./credits-tray.css";

export type CreditsSummary = {
  balanceDisplay: string;
  burnPencePerDay: number;
  runwayDays: number | null;
  daysToRenewal: number | null;
  runwayShortOfRenewal: boolean;
  speechEnabled: boolean;
};

/**
 * Owner chrome for Atom Credits — data from Atom-MC `/billing/credits/:id` (not OSS agent-backend).
 */
export function CreditsUsageTray({
  accountId,
  onOpenSettings,
}: {
  accountId: string;
  onOpenSettings?: (panel: "credits" | "speech" | "tier") => void;
}) {
  const [summary, setSummary] = useState<CreditsSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const base = CONTROL_PLANE_URL?.replace(/\/$/, "");
    if (!base) return;
    let cancelled = false;
    const load = async () => {
      try {
        // Prefer Supabase user id (MC wallet key); fall back to prop for stubs.
        let id = accountId.trim();
        if (isSupabaseConfigured()) {
          const { data } = await getSupabaseClient().auth.getUser();
          if (data.user?.id) id = data.user.id;
        }
        if (!id) return;
        const headers = await controlPlaneAuthHeaders();
        if (!headers) return;
        const resp = await fetch(`${base}/billing/credits/${encodeURIComponent(id)}`, { headers });
        if (!resp.ok) return;
        const data = (await resp.json()) as { summary?: CreditsSummary };
        if (!cancelled && data.summary) {
          setSummary(data.summary);
          if (data.summary.runwayShortOfRenewal) {
            setToast("At this rate you may run out of credits before renewal.");
          }
        }
      } catch {
        /* tray is best-effort; stub CP has no credits */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [accountId]);

  if (!summary) return null;

  const burnDisplay =
    summary.burnPencePerDay > 0 ? `£${(summary.burnPencePerDay / 100).toFixed(2)}/day` : "—";
  const runwayDisplay =
    summary.runwayDays == null ? "—" : summary.runwayDays >= 100 ? "100d+" : `${summary.runwayDays}d`;

  return (
    <div className="atom-credits-tray" role="status" aria-live="polite">
      <button
        type="button"
        className="atom-credits-tray__btn"
        onClick={() => onOpenSettings?.("credits")}
        title="Atom Credits"
      >
        <span className="atom-credits-tray__balance">{summary.balanceDisplay}</span>
        <span className="atom-credits-tray__meta">
          {burnDisplay} · {runwayDisplay} runway
        </span>
      </button>
      {toast ? (
        <div className="atom-credits-toast">
          <p>{toast}</p>
          <button
            type="button"
            className="atom-btn atom-btn-secondary"
            onClick={() => onOpenSettings?.("tier")}
          >
            Adjust settings
          </button>
          <button type="button" className="atom-btn atom-btn-ghost" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
