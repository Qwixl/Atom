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
import { loadBriefingPreferences } from "../briefing/briefingPreferences.js";

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

function parseHhMm(value: string): { hours: number; minutes: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

function isCurrentlyInQuietHours(quiet?: { start: string; end: string }): boolean {
  if (!quiet) return false;
  const start = parseHhMm(quiet.start);
  const end = parseHhMm(quiet.end);
  if (!start || !end) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const startMins = start.hours * 60 + start.minutes;
  const endMins = end.hours * 60 + end.minutes;
  if (startMins === endMins) return false;
  if (startMins < endMins) return mins >= startMins && mins < endMins;
  return mins >= startMins || mins < endMins;
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
  const [displayPrice, setDisplayPrice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [draftKind, setDraftKind] = useState<StandingIntentKind>("daily-briefing");
  const [draftTitle, setDraftTitle] = useState("Morning briefing");
  const [draftTime, setDraftTime] = useState("08:00");
  const [draftAt, setDraftAt] = useState("");
  const [draftMinutes, setDraftMinutes] = useState("60");
  const [draftQuery, setDraftQuery] = useState("");
  const [draftTopics, setDraftTopics] = useState(() => loadBriefingPreferences().topics.join(", "));
  const [draftQuietStart, setDraftQuietStart] = useState("");
  const [draftQuietEnd, setDraftQuietEnd] = useState("");
  const [draftChannel, setDraftChannel] = useState<"chat" | "push">("chat");

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
        setDisplayPrice(
          typeof billing.alwaysOnBrainDisplayPrice === "string"
            ? billing.alwaysOnBrainDisplayPrice
            : null,
        );
      } catch {
        setBillingTier(null);
        setDisplayPrice(null);
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
    const quietStart = draftQuietStart.trim();
    const quietEnd = draftQuietEnd.trim();
    const quietHours =
      quietStart && quietEnd && parseHhMm(quietStart) && parseHhMm(quietEnd)
        ? { start: quietStart, end: quietEnd }
        : undefined;
    const intent: StandingIntent = {
      id: newStandingIntentId(),
      kind: draftKind,
      enabled: true,
      title,
      trigger,
      delivery: {
        channel: draftChannel,
        ...(quietHours ? { quietHours } : {}),
      },
      createdAt: now,
      updatedAt: now,
      lastFiredAt: null,
    };
    if (draftKind === "daily-briefing") {
      const topics = draftTopics
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const prefsTopics = loadBriefingPreferences().topics;
      const merged = topics.length > 0 ? topics : prefsTopics;
      if (merged.length > 0) intent.scope = { topics: merged };
    } else if (draftKind === "watch" && draftQuery.trim()) {
      intent.scope = { query: draftQuery.trim() };
    }
    void persist([...intents, intent]);
  }

  const fields = (
    <>
      <p className="settings-note">
        Tell your agent what to watch for in the background. The heartbeat runs on your agent
        backend — always-on on hosted accounts during beta; self-hosted only while the process is
        up. Daily briefing here is the scheduled fire; Settings → Briefing controls only whether
        Chat also composes a briefing when you open it.
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
              {displayPrice ? ` · ${displayPrice} after beta` : ""}
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
              {intents.map((intent) => {
                const quiet = intent.delivery?.quietHours;
                const deferred = isCurrentlyInQuietHours(quiet);
                return (
                  <li key={intent.id}>
                    <div>
                      <strong>{intent.title}</strong>
                      <div className="settings-note">
                        {kindLabel(intent.kind)} · {triggerSummary(intent)}
                        {intent.delivery?.channel ? ` · ${intent.delivery.channel}` : ""}
                        {quiet ? ` · quiet ${quiet.start}–${quiet.end}` : ""}
                        {deferred ? " · deferred (quiet hours)" : ""}
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
                );
              })}
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
            <>
              <label className="atom-field">
                <span className="atom-field-label">Local time (HH:MM)</span>
                <input
                  value={draftTime}
                  onChange={(e) => setDraftTime(e.target.value)}
                  placeholder="08:00"
                  autoComplete="off"
                />
              </label>
              <label className="atom-field">
                <span className="atom-field-label">Topics (comma-separated)</span>
                <input
                  value={draftTopics}
                  onChange={(e) => setDraftTopics(e.target.value)}
                  placeholder="tech, politics"
                  autoComplete="off"
                />
              </label>
            </>
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
          <label className="atom-field">
            <span className="atom-field-label">Delivery channel</span>
            <select
              value={draftChannel}
              onChange={(e) => setDraftChannel(e.target.value as "chat" | "push")}
            >
              <option value="chat">Chat (in-app)</option>
              <option value="push">Push notification</option>
            </select>
          </label>
          <div className="atom-field-row" style={{ display: "flex", gap: "0.75rem" }}>
            <label className="atom-field" style={{ flex: 1 }}>
              <span className="atom-field-label">Quiet hours start (HH:MM)</span>
              <input
                value={draftQuietStart}
                onChange={(e) => setDraftQuietStart(e.target.value)}
                placeholder="22:00"
                autoComplete="off"
              />
            </label>
            <label className="atom-field" style={{ flex: 1 }}>
              <span className="atom-field-label">Quiet hours end (HH:MM)</span>
              <input
                value={draftQuietEnd}
                onChange={(e) => setDraftQuietEnd(e.target.value)}
                placeholder="07:00"
                autoComplete="off"
              />
            </label>
          </div>
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
