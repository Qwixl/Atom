import { useCallback, useEffect, useState } from "react";
import { loadCommsAgentConfig } from "../comms/storage.js";
import { fetchCustodyStatus, registerPasskey, type CustodyStatus } from "./client.js";

export function CustodySecurityPanel() {
  const [status, setStatus] = useState<CustodyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const config = loadCommsAgentConfig();
    if (!config.adminToken?.trim()) {
      setStatus(null);
      return;
    }
    try {
      setStatus(await fetchCustodyStatus(config));
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onRegisterPasskey() {
    setBusy(true);
    setNote(null);
    try {
      await registerPasskey(loadCommsAgentConfig());
      setNote("Passkey registered. Approvals now require biometric or PIN verification.");
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <h3>Connector custody</h3>
      <p className="settings-hint">
        Calendar and provider credentials stay in your agent vault — never in browser storage.
        Consequential approvals require a hardware-backed passkey.
      </p>
      <dl className="settings-kv">
        <dt>Vault</dt>
        <dd>{status?.vaultReady ? "ready" : "checking…"}</dd>
        <dt>Passkey</dt>
        <dd>{status?.passkeyRegistered ? "registered" : "not registered"}</dd>
      </dl>
      <div className="chrome-actions settings-section-actions">
        <button
          type="button"
          className="chrome-approve"
          disabled={busy || status?.passkeyRegistered}
          onClick={() => void onRegisterPasskey()}
        >
          {status?.passkeyRegistered ? "Passkey registered" : "Register passkey"}
        </button>
      </div>
      {note ? <p className="settings-note">{note}</p> : null}
    </section>
  );
}
