import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

export function MicrosoftGraphSettingsPanel({
  vaultUnlocked = true,
  embedded = false,
}: {
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { config, client } = useAgentConfig(vaultUnlocked);
  const [connected, setConnected] = useState(false);
  const [clientConfigured, setClientConfigured] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const status = await client.invokeConnector("microsoft-graph", "getStatus", {});
      const result = status.result as { connected?: boolean; clientConfigured?: boolean };
      setConnected(Boolean(result.connected));
      setClientConfigured(Boolean(result.clientConfigured));
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveClient() {
    const id = clientId.trim();
    if (!id) return;
    setBusy(true);
    setNote("Saving…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Configure Microsoft Graph app",
        { clientId: id },
        config,
      );
      await client.setMicrosoftOAuthClient(
        { clientId: id, clientSecret: clientSecret.trim() || undefined },
        approvalRef,
      );
      setClientSecret("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function connect() {
    // Open synchronously on the click gesture — awaiting first makes browsers
    // flash-and-close the popup (lost user activation). Do not use noopener:
    // we need the Window handle to set location after /oauth/start returns.
    const popup = window.open("about:blank", "atom-microsoft-oauth");
    setBusy(true);
    setNote("Opening Microsoft sign-in…");
    try {
      const started = await client.startMicrosoftOAuth();
      if (popup && !popup.closed) {
        popup.location.href = started.authorizeUrl;
      } else {
        window.location.assign(started.authorizeUrl);
        return;
      }
      setNote("Finish signing in in the new window, then click Refresh status.");
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setNote("Disconnecting…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Disconnect Microsoft Graph",
        {},
        config,
      );
      await client.disconnectMicrosoftOAuth(approvalRef);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  const byoForm = (
    <div className="atom-form-stack">
      <label>
        Application (client) ID
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          autoComplete="off"
        />
      </label>
      <label>
        Client secret (leave blank)
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="off"
        />
      </label>
      <button type="button" disabled={busy || !clientId.trim()} onClick={() => void saveClient()}>
        Save
      </button>
    </div>
  );

  return (
    <section className={embedded ? "atom-settings-embedded" : "atom-panel"}>
      {!embedded ? <h2>Microsoft 365</h2> : null}
      <p className="atom-note">Connect your Outlook calendar. Sign in with Microsoft and approve access.</p>
      {!config.adminToken && !vaultUnlocked ? (
        <p className="atom-note">Unlock your vault and connect your agent first.</p>
      ) : (
        <>
          <p className="atom-note">Status: {connected ? "Connected" : "Not connected"}</p>
          {clientConfigured ? (
            <>
              <div className="atom-button-row">
                <button type="button" disabled={busy} onClick={() => void connect()}>
                  {connected ? "Reconnect Microsoft 365" : "Connect Microsoft 365"}
                </button>
                <button type="button" disabled={busy} onClick={() => void refresh()}>
                  Refresh status
                </button>
                {connected ? (
                  <button type="button" disabled={busy} onClick={() => void disconnect()}>
                    Disconnect
                  </button>
                ) : null}
              </div>
              <details className="settings-advanced">
                <summary>Advanced</summary>
                <div className="settings-advanced-body">
                  <p className="atom-note">
                    Only for self-hosters using their own Microsoft app registration.
                  </p>
                  {byoForm}
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="atom-note">
                Microsoft sign-in is not available on this agent yet. If you run Atom yourself, open
                Advanced below; otherwise this needs a deploy that includes the shared Atom Microsoft
                app.
              </p>
              <details className="settings-advanced">
                <summary>Advanced</summary>
                <div className="settings-advanced-body">
                  <p className="atom-note">
                    Paste your Microsoft app&apos;s Application (client) ID — a GUID, not an email.
                    Redirect URI must be{" "}
                    <code>{`{publicBaseUrl}/connectors/microsoft/callback`}</code>.
                  </p>
                  {byoForm}
                </div>
              </details>
              <div className="atom-button-row">
                <button type="button" disabled={busy} onClick={() => void refresh()}>
                  Refresh status
                </button>
              </div>
            </>
          )}
          {note ? <p className="atom-note">{note}</p> : null}
        </>
      )}
    </section>
  );
}
