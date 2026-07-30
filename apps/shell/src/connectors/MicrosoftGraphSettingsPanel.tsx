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
        Client secret (optional for public/PKCE clients)
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="off"
        />
      </label>
      <button type="button" disabled={busy || !clientId.trim()} onClick={() => void saveClient()}>
        Save Entra app override
      </button>
    </div>
  );

  return (
    <section className={embedded ? "atom-settings-embedded" : "atom-panel"}>
      {!embedded ? <h2>Microsoft 365</h2> : null}
      <p className="atom-note">
        Connect calendar read access via Microsoft Graph (`Calendars.Read`). Refresh tokens stay in
        your agent vault. Hosted Atom uses a shared Entra app — you should only need Connect.
      </p>
      {!config.adminToken && !vaultUnlocked ? (
        <p className="atom-note">Unlock your vault and connect your agent first.</p>
      ) : (
        <>
          <p className="atom-note">
            Status: {connected ? "Connected" : "Not connected"}
            {clientConfigured ? " · Sign-in ready" : " · Sign-in not available yet"}
          </p>
          {clientConfigured ? (
            <>
              <div className="atom-button-row">
                <button type="button" disabled={busy} onClick={() => void connect()}>
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
              <details className="settings-advanced">
                <summary>Advanced — use your own Entra app</summary>
                <div className="settings-advanced-body">
                  <p className="atom-note">
                    Override the shared Atom client ID for your own tenant or custom-domain
                    self-host. Redirect URI must match your agent&apos;s public base URL exactly.
                  </p>
                  {byoForm}
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="atom-note">
                One-tap Microsoft calendar is not available on this deployment yet — the Atom Entra
                application has not been registered. Self-hosters can provide their own app below.
              </p>
              <details className="settings-advanced">
                <summary>Advanced — bring your own Entra app</summary>
                <div className="settings-advanced-body">
                  <p className="atom-note">
                    Register an app in your tenant, then paste its client ID here. Redirect URI must
                    be <code>{`{publicBaseUrl}/connectors/microsoft/callback`}</code> for your
                    agent.
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
