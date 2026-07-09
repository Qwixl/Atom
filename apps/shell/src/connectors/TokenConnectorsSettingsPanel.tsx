import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

const SIMPLE_TOKEN_CONNECTORS = [
  {
    id: "todoist",
    label: "Todoist",
    hint: "Personal API token from Todoist settings.",
  },
  {
    id: "github",
    label: "GitHub",
    hint: "Personal access token with Issues and Notifications read access.",
  },
  {
    id: "notion",
    label: "Notion",
    hint: "Integration token for pages you share with it.",
  },
  {
    id: "linear",
    label: "Linear",
    hint: "Personal API key from Linear account settings.",
  },
] as const;

type SimpleTokenConnectorId = (typeof SIMPLE_TOKEN_CONNECTORS)[number]["id"];

export function TokenConnectorsSettingsPanel({
  vaultUnlocked = true,
  embedded = false,
}: {
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { config, client } = useAgentConfig(vaultUnlocked);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [connected, setConnected] = useState<Record<SimpleTokenConnectorId | "trello" | "home-assistant" | "bluesky" | "mastodon", boolean>>({
    todoist: false,
    github: false,
    notion: false,
    linear: false,
    trello: false,
    "home-assistant": false,
    bluesky: false,
    mastodon: false,
  });
  const [draftTokens, setDraftTokens] = useState<Record<SimpleTokenConnectorId, string>>({
    todoist: "",
    github: "",
    notion: "",
    linear: "",
  });
  const [trelloApiKey, setTrelloApiKey] = useState("");
  const [trelloToken, setTrelloToken] = useState("");
  const [haBaseUrl, setHaBaseUrl] = useState("");
  const [haToken, setHaToken] = useState("");
  const [bskyHandle, setBskyHandle] = useState("");
  const [bskyPassword, setBskyPassword] = useState("");
  const [bskyPdsUrl, setBskyPdsUrl] = useState("");
  const [mastoInstanceUrl, setMastoInstanceUrl] = useState("");
  const [mastoToken, setMastoToken] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const next = {
        todoist: false,
        github: false,
        notion: false,
        linear: false,
        trello: false,
        "home-assistant": false,
        bluesky: false,
        mastodon: false,
      } as Record<SimpleTokenConnectorId | "trello" | "home-assistant" | "bluesky" | "mastodon", boolean>;
      for (const connector of SIMPLE_TOKEN_CONNECTORS) {
        const status = await client.connectorStatus(connector.id);
        next[connector.id] = Boolean(status.configured);
      }
      next.trello = Boolean((await client.connectorStatus("trello")).configured);
      next["home-assistant"] = Boolean((await client.connectorStatus("home-assistant")).configured);
      next.bluesky = Boolean((await client.connectorStatus("bluesky")).configured);
      next.mastodon = Boolean((await client.connectorStatus("mastodon")).configured);
      setConnected(next);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveToken(connectorId: SimpleTokenConnectorId, label: string) {
    const token = draftTokens[connectorId].trim();
    if (!token) return;
    setBusy(true);
    setNote(`Saving ${label} token to your agent vault…`);
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        `Save ${label} token`,
        { connectorId },
        config,
      );
      await client.setConnectorToken(connectorId, token, approvalRef);
      setDraftTokens((prev) => ({ ...prev, [connectorId]: "" }));
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeToken(connectorId: SimpleTokenConnectorId, label: string) {
    setBusy(true);
    setNote(`Removing ${label} token…`);
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        `Remove ${label} token`,
        { connectorId },
        config,
      );
      await client.clearConnectorToken(connectorId, approvalRef);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function saveTrello() {
    const apiKey = trelloApiKey.trim();
    const token = trelloToken.trim();
    if (!apiKey || !token) return;
    setBusy(true);
    setNote("Saving Trello credentials to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Save Trello credentials", { connectorId: "trello" }, config);
      await client.saveTrelloCredentials({ apiKey, token, approvalRef });
      setTrelloApiKey("");
      setTrelloToken("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeTrello() {
    setBusy(true);
    setNote("Removing Trello credentials…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Remove Trello credentials", { connectorId: "trello" }, config);
      await client.clearTrelloCredentials(approvalRef);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function saveHomeAssistant() {
    const baseUrl = haBaseUrl.trim();
    const accessToken = haToken.trim();
    if (!baseUrl || !accessToken) return;
    setBusy(true);
    setNote("Saving Home Assistant credentials to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Save Home Assistant credentials",
        { connectorId: "home-assistant" },
        config,
      );
      await client.saveHomeAssistantCredentials({ baseUrl, accessToken, approvalRef });
      setHaBaseUrl("");
      setHaToken("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeHomeAssistant() {
    setBusy(true);
    setNote("Removing Home Assistant credentials…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Remove Home Assistant credentials",
        { connectorId: "home-assistant" },
        config,
      );
      await client.clearHomeAssistantCredentials(approvalRef);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function saveBluesky() {
    const handle = bskyHandle.trim();
    const appPassword = bskyPassword.trim();
    if (!handle || !appPassword) return;
    setBusy(true);
    setNote("Saving Bluesky credentials to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Save Bluesky credentials", { connectorId: "bluesky" }, config);
      await client.saveBlueskyCredentials({
        handle,
        appPassword,
        pdsUrl: bskyPdsUrl.trim() || undefined,
        approvalRef,
      });
      setBskyHandle("");
      setBskyPassword("");
      setBskyPdsUrl("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeBluesky() {
    setBusy(true);
    setNote("Removing Bluesky credentials…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Remove Bluesky credentials", { connectorId: "bluesky" }, config);
      await client.clearBlueskyCredentials(approvalRef);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function saveMastodon() {
    const instanceUrl = mastoInstanceUrl.trim();
    const accessToken = mastoToken.trim();
    if (!instanceUrl || !accessToken) return;
    setBusy(true);
    setNote("Saving Mastodon credentials to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Save Mastodon credentials", { connectorId: "mastodon" }, config);
      await client.saveMastodonCredentials({ instanceUrl, accessToken, approvalRef });
      setMastoInstanceUrl("");
      setMastoToken("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeMastodon() {
    setBusy(true);
    setNote("Removing Mastodon credentials…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Remove Mastodon credentials", { connectorId: "mastodon" }, config);
      await client.clearMastodonCredentials(approvalRef);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  return (
    <section className={embedded ? "settings-subpanel" : "settings-panel"}>
      {!embedded ? (
        <header className="settings-panel-head">
          <h3>Connected apps</h3>
          <p className="settings-panel-desc">Paste an access token for each app. Tokens stay on your agent.</p>
        </header>
      ) : null}

      {SIMPLE_TOKEN_CONNECTORS.map((connector) => (
        <div key={connector.id} className="connector-card">
          <div className="connector-card-head">
            <strong>{connector.label}</strong>
            <span className={connected[connector.id] ? "connector-status is-on" : "connector-status"}>
              {connected[connector.id] ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="settings-note">{connector.hint}</p>
          <div className="connector-form-grid">
            <label className="atom-field">
              <span className="atom-field-label">Access token</span>
              <input
                type="password"
                autoComplete="off"
                placeholder={`${connector.label} token`}
                value={draftTokens[connector.id]}
                onChange={(event) =>
                  setDraftTokens((prev) => ({ ...prev, [connector.id]: event.target.value }))
                }
                disabled={busy || !vaultUnlocked}
              />
            </label>
          </div>
          <div className="chrome-actions settings-section-actions">
            <button
              type="button"
              className="chrome-approve"
              disabled={busy || !vaultUnlocked || !draftTokens[connector.id].trim()}
              onClick={() => void saveToken(connector.id, connector.label)}
            >
              Save
            </button>
            {connected[connector.id] ? (
              <button
                type="button"
                disabled={busy || !vaultUnlocked}
                onClick={() => void removeToken(connector.id, connector.label)}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      ))}

      <div className="connector-card">
        <div className="connector-card-head">
          <strong>Trello</strong>
          <span className={connected.trello ? "connector-status is-on" : "connector-status"}>
            {connected.trello ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="settings-note">API key and user token from Trello.</p>
        <div className="connector-form-grid">
          <label className="atom-field">
            <span className="atom-field-label">API key</span>
            <input
              type="password"
              autoComplete="off"
              value={trelloApiKey}
              onChange={(event) => setTrelloApiKey(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
          <label className="atom-field">
            <span className="atom-field-label">User token</span>
            <input
              type="password"
              autoComplete="off"
              value={trelloToken}
              onChange={(event) => setTrelloToken(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
        </div>
        <div className="chrome-actions settings-section-actions">
          <button
            type="button"
            className="chrome-approve"
            disabled={busy || !vaultUnlocked || !trelloApiKey.trim() || !trelloToken.trim()}
            onClick={() => void saveTrello()}
          >
            Save
          </button>
          {connected.trello ? (
            <button type="button" disabled={busy || !vaultUnlocked} onClick={() => void removeTrello()}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="connector-card">
        <div className="connector-card-head">
          <strong>Home Assistant</strong>
          <span className={connected["home-assistant"] ? "connector-status is-on" : "connector-status"}>
            {connected["home-assistant"] ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="settings-note">Home address and a long-lived access token.</p>
        <div className="connector-form-grid">
          <label className="atom-field">
            <span className="atom-field-label">Home address</span>
            <input
              placeholder="https://…"
              value={haBaseUrl}
              onChange={(event) => setHaBaseUrl(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
          <label className="atom-field">
            <span className="atom-field-label">Access token</span>
            <input
              type="password"
              autoComplete="off"
              value={haToken}
              onChange={(event) => setHaToken(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
        </div>
        <div className="chrome-actions settings-section-actions">
          <button
            type="button"
            className="chrome-approve"
            disabled={busy || !vaultUnlocked || !haBaseUrl.trim() || !haToken.trim()}
            onClick={() => void saveHomeAssistant()}
          >
            Save
          </button>
          {connected["home-assistant"] ? (
            <button type="button" disabled={busy || !vaultUnlocked} onClick={() => void removeHomeAssistant()}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="connector-card">
        <div className="connector-card-head">
          <strong>Bluesky</strong>
          <span className={connected.bluesky ? "connector-status is-on" : "connector-status"}>
            {connected.bluesky ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="settings-note">Handle and an app password from Bluesky settings.</p>
        <div className="connector-form-grid">
          <label className="atom-field">
            <span className="atom-field-label">Handle</span>
            <input
              placeholder="you.bsky.social"
              value={bskyHandle}
              onChange={(event) => setBskyHandle(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
          <label className="atom-field">
            <span className="atom-field-label">App password</span>
            <input
              type="password"
              autoComplete="off"
              value={bskyPassword}
              onChange={(event) => setBskyPassword(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
          <label className="atom-field connector-form-span">
            <span className="atom-field-label">Custom server (optional)</span>
            <input
              placeholder="Leave blank for bsky.social"
              value={bskyPdsUrl}
              onChange={(event) => setBskyPdsUrl(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
        </div>
        <div className="chrome-actions settings-section-actions">
          <button
            type="button"
            className="chrome-approve"
            disabled={busy || !vaultUnlocked || !bskyHandle.trim() || !bskyPassword.trim()}
            onClick={() => void saveBluesky()}
          >
            Save
          </button>
          {connected.bluesky ? (
            <button type="button" disabled={busy || !vaultUnlocked} onClick={() => void removeBluesky()}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="connector-card">
        <div className="connector-card-head">
          <strong>Mastodon</strong>
          <span className={connected.mastodon ? "connector-status is-on" : "connector-status"}>
            {connected.mastodon ? "Connected" : "Not connected"}
          </span>
        </div>
        <p className="settings-note">Your instance address and an access token.</p>
        <div className="connector-form-grid">
          <label className="atom-field">
            <span className="atom-field-label">Instance URL</span>
            <input
              placeholder="https://…"
              value={mastoInstanceUrl}
              onChange={(event) => setMastoInstanceUrl(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
          <label className="atom-field">
            <span className="atom-field-label">Access token</span>
            <input
              type="password"
              autoComplete="off"
              value={mastoToken}
              onChange={(event) => setMastoToken(event.target.value)}
              disabled={busy || !vaultUnlocked}
            />
          </label>
        </div>
        <div className="chrome-actions settings-section-actions">
          <button
            type="button"
            className="chrome-approve"
            disabled={busy || !vaultUnlocked || !mastoInstanceUrl.trim() || !mastoToken.trim()}
            onClick={() => void saveMastodon()}
          >
            Save
          </button>
          {connected.mastodon ? (
            <button type="button" disabled={busy || !vaultUnlocked} onClick={() => void removeMastodon()}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {note ? <p className="settings-note">{note}</p> : null}
    </section>
  );
}
