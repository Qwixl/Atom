import { useCallback, useEffect, useState } from "react";
import { ensureFreshChatSessionToken, getChatSessionToken } from "../comms/chatSessionToken.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";
import { usesSupabaseHostedAuth } from "../hostConfig.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";
import {
  ensureCapacitorPush,
  ensureWebPushSubscription,
  fetchPushStatus,
  loadPushOptIn,
  savePushOptIn,
  unsubscribeWebPush,
} from "./pushRegistration.js";

export function PushSettingsPanel({
  vaultUnlocked,
  embedded = false,
}: {
  vaultUnlocked: boolean;
  embedded?: boolean;
}) {
  const { config } = useAgentConfig(vaultUnlocked);
  const [optIn, setOptIn] = useState(loadPushOptIn);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<{ web: boolean; fcm: boolean } | null>(null);

  const refresh = useCallback(async () => {
    if (!vaultUnlocked) {
      setConfigured(null);
      return;
    }
    if (!config.adminToken?.trim() && !usesSupabaseHostedAuth() && !getChatSessionToken()) {
      setConfigured(null);
      return;
    }
    try {
      await ensureFreshChatSessionToken(config);
      const status = await fetchPushStatus(config);
      setConfigured({ web: status.webPushConfigured, fcm: status.fcmConfigured });
    } catch {
      setConfigured(null);
    }
  }, [config, vaultUnlocked]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setEnabled(enabled: boolean) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      savePushOptIn(enabled);
      setOptIn(enabled);
      if (!enabled) {
        await unsubscribeWebPush(config);
        setNote("Push notifications disabled.");
        return;
      }
      await ensureFreshChatSessionToken(config);
      const native = await ensureCapacitorPush(config);
      if (native === "subscribed") {
        setNote("Android push registered.");
        return;
      }
      const web = await ensureWebPushSubscription(config);
      if (web === "subscribed") setNote("Browser push registered.");
      else if (web === "not-configured")
        setNote("Push opted in — agent needs VAPID keys (ATOM_VAPID_*) to deliver.");
      else if (web === "denied") setError("Notification permission denied.");
      else if (web === "unsupported") setError("This browser does not support Web Push.");
      else setError("Could not register for push.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      window.setTimeout(() => setNote(null), 4000);
    }
  }

  const fields = (
    <>
      <p className="settings-note">
        Receive Agent Brain alerts when Chat is closed. Desktop uses Web Push; Android uses FCM via
        the Capacitor wrapper. Chat polling remains the foreground fallback.
      </p>
      {!vaultUnlocked || !config.adminToken?.trim() ? (
        <p className="settings-note">Unlock the vault and connect your agent to manage push.</p>
      ) : (
        <>
          {configured ? (
            <p className="settings-note">
              Agent: Web Push {configured.web ? "ready" : "not configured"}
              {" · "}
              FCM {configured.fcm ? "ready" : "not configured"}
            </p>
          ) : null}
          <SettingsToggle
            checked={optIn}
            label="Enable push notifications"
            disabled={busy}
            onChange={(enabled) => void setEnabled(enabled)}
          />
          {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
          {error ? <p className="settings-note settings-error">{error}</p> : null}
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <section className="settings-section" aria-labelledby="settings-push-heading">
        <h3 id="settings-push-heading">Push notifications</h3>
        <div className="settings-panel-fields connector-settings">{fields}</div>
      </section>
    );
  }
  return (
    <section className="settings-section connector-settings">
      <h3>Push notifications</h3>
      {fields}
    </section>
  );
}
