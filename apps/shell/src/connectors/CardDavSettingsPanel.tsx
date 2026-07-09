import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

interface CardDavAccountSummary {
  id: string;
  label: string;
}

export function CardDavSettingsPanel({
  vaultUnlocked = true,
  embedded = false,
}: {
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { config, client } = useAgentConfig(vaultUnlocked);
  const [label, setLabel] = useState("");
  const [addressBookUrl, setAddressBookUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<CardDavAccountSummary[]>([]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const status = await client.invokeConnector("carddav", "getStatus", {});
      const result = status.result as { accounts?: CardDavAccountSummary[] };
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
    const url = addressBookUrl.trim();
    const user = username.trim();
    const pass = password.trim();
    if (!url || !user || !pass) return;
    setBusy(true);
    setNote("Saving CardDAV account to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Add CardDAV account",
        { addressBookUrl: url, username: user },
        config,
      );
      await client.addCardDavAccount(
        { label: label.trim() || undefined, addressBookUrl: url, username: user, password: pass },
        approvalRef,
      );
      setLabel("");
      setAddressBookUrl("");
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
    setNote("Removing CardDAV account…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Remove CardDAV account",
        { accountId },
        config,
      );
      await client.removeCardDavAccount(accountId, approvalRef);
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
        <header className="settings-panel-head">
          <h3>Contacts</h3>
          <p className="settings-panel-desc">Sign in with an address book URL and app password.</p>
        </header>
      ) : null}

      {!vaultUnlocked ? (
        <p className="settings-note webcal-settings-warn">Unlock your vault to save contacts.</p>
      ) : null}

      <div className="connector-form-grid">
        <label className="atom-field">
          <span className="atom-field-label">Name</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy || !vaultUnlocked}
            placeholder="Personal contacts"
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Address book URL</span>
          <input
            value={addressBookUrl}
            onChange={(e) => setAddressBookUrl(e.target.value)}
            disabled={busy || !vaultUnlocked}
            placeholder="https://…/cards/…/"
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy || !vaultUnlocked}
            autoComplete="username"
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">App password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy || !vaultUnlocked}
            autoComplete="new-password"
          />
        </label>
      </div>
      <div className="chrome-actions settings-section-actions">
        <button
          type="button"
          className="chrome-approve"
          disabled={busy || !vaultUnlocked || !addressBookUrl.trim() || !username.trim() || !password.trim()}
          onClick={() => void saveAccount()}
        >
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
    return <section className="settings-subpanel">{body}</section>;
  }
  return <section className="settings-panel">{body}</section>;
}
