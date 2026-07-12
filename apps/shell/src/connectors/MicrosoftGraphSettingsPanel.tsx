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
    setNote("Saving Entra app credentials to your agent vault…");
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
    setBusy(true);
    setNote("Opening Microsoft sign-in…");
    try {
      const started = await client.startMicrosoftOAuth();
      window.open(started.authorizeUrl, "_blank", "noopener,noreferrer");
      setNote("Complete sign-in in the new window, then refresh status here.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setNote("Disconnecting Microsoft…");
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

  return (
    <section className={embedded ? "atom-settings-embedded" : "atom-panel"}>
      {!embedded ? <h2>Microsoft 365</h2> : null}
      <p className="atom-note">
        Connect calendar read access via Microsoft Graph (`Calendars.Read`). Refresh tokens stay in
        your agent vault. Multi-tenant production consent waits on Partner publisher verification.
      </p>
      {!config.adminToken && !vaultUnlocked ? (
        <p className="atom-note">Unlock your vault and connect your agent first.</p>
      ) : (
        <>
          <p className="atom-note">
            Status: {connected ? "Connected" : "Not connected"}
            {clientConfigured ? " · Entra app configured" : " · Entra app not configured"}
          </p>
          {!clientConfigured ? (
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
                Client secret (optional for public/PKCE clients)
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <button type="button" disabled={busy || !clientId.trim()} onClick={() => void saveClient()}>
                Save Entra app
              </button>
            </div>
          ) : null}
          <div className="atom-button-row">
            <button type="button" disabled={busy || !clientConfigured} onClick={() => void connect()}>
              Connect Microsoft 365
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
          {note ? <p className="atom-note">{note}</p> : null}
        </>
      )}
    </section>
  );
}
