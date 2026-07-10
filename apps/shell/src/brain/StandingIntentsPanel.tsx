import { useCallback, useEffect, useState } from "react";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import {
  loadBrainIntents,
  loadBrainStatus,
  newStandingIntentId,
  saveBrainIntents,
  type BrainStatus,
  type StandingIntent,
  type StandingIntentKind,
} from "../custody/client.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";
import { CommsAgentClient } from "../comms/client.js";

function kindLabel(kind: StandingIntentKind): string {
  switch (kind) {
    case "daily-briefing":
      return "Daily briefing";
    case "reminder":
      return "Reminder";
    case "watch":
      return "Watch";
  }
}

function triggerSummary(intent: StandingIntent): string {
  switch (intent.trigger.type) {
    case "daily-time":
      return `Every day at ${intent.trigger.time}`;
    case "at":
      return `Once at ${new Date(intent.trigger.at).toLocaleString()}`;
    case "interval":
      return `Every ${intent.trigger.everyMinutes} min`;
  }
}

export function StandingIntentsPanel({
  vaultUnlocked,
  embedded = false,
}: {
  vaultUnlocked: boolean;
  embedded?: boolean;
}) {
  const { config } = useAgentConfig(vaultUnlocked);
  const [intents, setIntents] = useState<StandingIntent[]>([]);
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [billingTier, setBillingTier] = useState<"beta" | "subscribed" | "duty-cycled" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftKind, setDraftKind] = useState<StandingIntentKind>("daily-briefing");
  const [draftTitle, setDraftTitle] = useState("Morning briefing");
  const [draftTime, setDraftTime] = useState("08:00");
  const [draftAt, setDraftAt] = useState("");
  const [draftMinutes, setDraftMinutes] = useState("60");
  const [draftQuery, setDraftQuery] = useState("");

  const refresh = useCallback(async () => {
    if (!vaultUnlocked || !config.adminToken?.trim()) {
      setIntents([]);
      setStatus(null);
      setBillingTier(null);
      return;
    }
    try {
      setError(null);
      const [next, st] = await Promise.all([loadBrainIntents(config), loadBrainStatus(config)]);
      setIntents(next);
      setStatus(st);
      try {
        const billing = await new CommsAgentClient(config.adminUrl, {
          adminToken: config.adminToken,
        }).billingStatus();
        setBillingTier(billing.alwaysOnBrainTier ?? (billing.betaFree ? "beta" : null));
      } catch {
        setBillingTier(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [config, vaultUnlocked]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function persist(next: StandingIntent[]) {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveBrainIntents(config, next);
      setIntents(saved);
      setNote("Saved.");
      window.setTimeout(() => setNote(null), 2000);
      const st = await loadBrainStatus(config);
      setStatus(st);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleEnabled(id: string, enabled: boolean) {
    void persist(
      intents.map((i) =>
        i.id === id ? { ...i, enabled, updatedAt: new Date().toISOString() } : i,
      ),
    );
  }

  function removeIntent(id: string) {
    void persist(intents.filter((i) => i.id !== id));
  }

  function addIntent() {
    const now = new Date().toISOString();
    let trigger: StandingIntent["trigger"];
    if (draftKind === "daily-briefing") {
      trigger = { type: "daily-time", time: draftTime.trim() || "08:00" };
    } else if (draftKind === "reminder") {
      const at = draftAt.trim() || new Date(Date.now() + 3_600_000).toISOString();
      trigger = { type: "at", at };
    } else {
      const everyMinutes = Math.max(1, Number(draftMinutes) || 60);
      trigger = { type: "interval", everyMinutes };
    }
    const title = draftTitle.trim() || kindLabel(draftKind);
    const intent: StandingIntent = {
      id: newStandingIntentId(),
      kind: draftKind,
      enabled: true,
      title,
      trigger,
      createdAt: now,
      updatedAt: now,
      lastFiredAt: null,
    };
    if (draftKind === "watch" && draftQuery.trim()) {
      intent.scope = { query: draftQuery.trim() };
    }
    void persist([...intents, intent]);
  }

  const fields = (
    <>
      <p className="settings-note">
        Tell your agent what to watch for in the background. The heartbeat runs on your agent
        backend — always-on on hosted accounts during beta; self-hosted only while the process is
        up.
      </p>
      {!vaultUnlocked || !config.adminToken?.trim() ? (
        <p className="settings-note">Unlock the vault and connect your agent to manage intents.</p>
      ) : (
        <>
          {status ? (
            <p className="settings-note">
              Heartbeat: {status.running ? "running" : "stopped"}
              {status.alwaysOn ? " · always-on" : " · duty-cycled"}
              {billingTier === "beta" ? " · beta included" : ""}
              {billingTier === "subscribed" ? " · subscribed" : ""}
              {billingTier === "duty-cycled" ? " · free tier" : ""}
              {status.lastTickAt
                ? ` · last tick ${new Date(status.lastTickAt).toLocaleString()}`
                : ""}
              {status.pendingCount > 0 ? ` · ${status.pendingCount} pending` : ""}
            </p>
          ) : null}
          {intents.length === 0 ? (
            <p className="settings-note">No standing intents yet.</p>
          ) : (
            <ul className="webcal-feeds">
              {intents.map((intent) => (
                <li key={intent.id}>
                  <div>
                    <strong>{intent.title}</strong>
                    <div className="settings-note">
                      {kindLabel(intent.kind)} · {triggerSummary(intent)}
                      {intent.lastFiredAt
                        ? ` · last fired ${new Date(intent.lastFiredAt).toLocaleString()}`
                        : ""}
                    </div>
                    <SettingsToggle
                      checked={intent.enabled}
                      label="Enabled"
                      disabled={busy}
                      onChange={(enabled) => toggleEnabled(intent.id, enabled)}
                    />
                  </div>
                  <button
                    type="button"
                    className="webcal-remove"
                    disabled={busy}
                    onClick={() => removeIntent(intent.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h4 className="settings-subheading">Add intent</h4>
          <label className="atom-field">
            <span className="atom-field-label">Type</span>
            <select
              value={draftKind}
              onChange={(e) => {
                const kind = e.target.value as StandingIntentKind;
                setDraftKind(kind);
                if (kind === "daily-briefing") setDraftTitle("Morning briefing");
                else if (kind === "reminder") setDraftTitle("Reminder");
                else setDraftTitle("Watch");
              }}
            >
              <option value="daily-briefing">Daily briefing</option>
              <option value="reminder">Reminder</option>
              <option value="watch">Watch</option>
            </select>
          </label>
          <label className="atom-field">
            <span className="atom-field-label">Title</span>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              autoComplete="off"
            />
          </label>
          {draftKind === "daily-briefing" ? (
            <label className="atom-field">
              <span className="atom-field-label">Local time (HH:MM)</span>
              <input
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                placeholder="08:00"
                autoComplete="off"
              />
            </label>
          ) : null}
          {draftKind === "reminder" ? (
            <label className="atom-field">
              <span className="atom-field-label">When (ISO datetime)</span>
              <input
                value={draftAt}
                onChange={(e) => setDraftAt(e.target.value)}
                placeholder={new Date(Date.now() + 3_600_000).toISOString()}
                autoComplete="off"
              />
            </label>
          ) : null}
          {draftKind === "watch" ? (
            <>
              <label className="atom-field">
                <span className="atom-field-label">Every N minutes</span>
                <input
                  value={draftMinutes}
                  onChange={(e) => setDraftMinutes(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </label>
              <label className="atom-field">
                <span className="atom-field-label">Query / topic (optional)</span>
                <input
                  value={draftQuery}
                  onChange={(e) => setDraftQuery(e.target.value)}
                  placeholder="e.g. calendar conflicts"
                  autoComplete="off"
                />
              </label>
            </>
          ) : null}
          <div className="chrome-actions settings-section-actions">
            <button
              type="button"
              className="chrome-approve"
              disabled={busy || !draftTitle.trim()}
              onClick={addIntent}
            >
              Add standing intent
            </button>
          </div>
          {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
          {error ? <p className="settings-note settings-error">{error}</p> : null}
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <section className="settings-section" aria-labelledby="settings-brain-heading">
        <h3 id="settings-brain-heading">Standing intents</h3>
        <div className="settings-panel-fields connector-settings">{fields}</div>
      </section>
    );
  }
  return (
    <section className="settings-section connector-settings">
      <h3>Standing intents</h3>
      {fields}
    </section>
  );
}
