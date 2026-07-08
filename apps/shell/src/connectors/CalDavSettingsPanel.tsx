import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

interface CalDavAccountSummary {
  id: string;
  label: string;
}

export function CalDavSettingsPanel({
  vaultUnlocked = true,
  embedded = false,
}: {
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { config, client } = useAgentConfig(vaultUnlocked);
  const [label, setLabel] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<CalDavAccountSummary[]>([]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const status = await client.invokeConnector("caldav", "getStatus", {});
      const result = status.result as { accounts?: CalDavAccountSummary[] };
      setAccounts(result.accounts ?? []);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveAccount() {
    const url = calendarUrl.trim();
    const user = username.trim();
    const pass = password.trim();
    if (!url || !user || !pass) return;
    setBusy(true);
    setNote("Saving CalDAV account to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Add CalDAV account",
        { calendarUrl: url, username: user },
        config,
      );
      await client.addCalDavAccount(
        { label: label.trim() || undefined, calendarUrl: url, username: user, password: pass },
        approvalRef,
      );
      setLabel("");
      setCalendarUrl("");
      setUsername("");
      setPassword("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeAccount(accountId: string) {
    setBusy(true);
    setNote("Removing CalDAV account…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Remove CalDAV account",
        { accountId },
        config,
      );
      await client.removeCalDavAccount(accountId, approvalRef);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  const body = (
    <>
      {!embedded ? (
        <header>
          <h3>CalDAV</h3>
          <p>Read/write calendar via app password (Fastmail, Nextcloud, iCloud).</p>
        </header>
      ) : (
        <>
          <h4>CalDAV</h4>
          <p className="connectors-hint">
            Paste your calendar collection URL and app-specific password. Example: Fastmail{" "}
            <code>https://caldav.fastmail.com/dav/calendars/user/you/Calendar/</code>
          </p>
        </>
      )}

      {!vaultUnlocked ? (
        <p className="settings-note webcal-settings-warn">Unlock your vault to save CalDAV accounts.</p>
      ) : null}

      <div className="connectors-token-row">
        <span className="atom-field-label">Label</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy || !vaultUnlocked} placeholder="Work calendar" />
        <span className="atom-field-label">Calendar URL (https)</span>
        <input
          value={calendarUrl}
          onChange={(e) => setCalendarUrl(e.target.value)}
          disabled={busy || !vaultUnlocked}
          placeholder="https://…/calendars/…/"
        />
        <span className="atom-field-label">Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy || !vaultUnlocked}
          autoComplete="username"
        />
        <span className="atom-field-label">App password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy || !vaultUnlocked}
          autoComplete="new-password"
        />
        <button type="button" disabled={busy || !vaultUnlocked || !calendarUrl.trim() || !username.trim() || !password.trim()} onClick={() => void saveAccount()}>
          Save account
        </button>
      </div>

      {accounts.length > 0 ? (
        <div className="webcal-feeds">
          {accounts.map((account) => (
            <div key={account.id} className="webcal-feed-row">
              <span>{account.label}</span>
              <button type="button" className="webcal-remove" disabled={busy} onClick={() => void removeAccount(account.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
    </>
  );

  if (embedded) {
    return <section className="connectors-subpanel">{body}</section>;
  }
  return <section className="connectors-panel">{body}</section>;
}
