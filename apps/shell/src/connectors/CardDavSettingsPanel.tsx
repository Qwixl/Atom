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
        <header>
          <h3>CardDAV</h3>
          <p>Read contacts via app password (Fastmail, Nextcloud, iCloud).</p>
        </header>
      ) : (
        <>
          <h4>CardDAV</h4>
          <p className="connectors-hint">
            Paste your address book collection URL and app-specific password. Example: Fastmail{" "}
            <code>https://carddav.fastmail.com/dav/cards/user/you/Default/</code>
          </p>
        </>
      )}

      {!vaultUnlocked ? (
        <p className="settings-note webcal-settings-warn">Unlock your vault to save CardDAV accounts.</p>
      ) : null}

      <div className="connectors-token-row">
        <span className="atom-field-label">Label</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy || !vaultUnlocked} placeholder="Personal contacts" />
        <span className="atom-field-label">Address book URL (https)</span>
        <input
          value={addressBookUrl}
          onChange={(e) => setAddressBookUrl(e.target.value)}
          disabled={busy || !vaultUnlocked}
          placeholder="https://…/cards/…/"
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
        <button type="button" disabled={busy || !vaultUnlocked || !addressBookUrl.trim() || !username.trim() || !password.trim()} onClick={() => void saveAccount()}>
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
