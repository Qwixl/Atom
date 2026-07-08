import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

const TOKEN_CONNECTORS = [
  {
    id: "todoist",
    label: "Todoist",
    hint: "Personal API token from Todoist → Settings → Integrations → Developer.",
  },
  {
    id: "github",
    label: "GitHub",
    hint: "Fine-grained PAT with Issues and Notifications read access.",
  },
  {
    id: "notion",
    label: "Notion",
    hint: "Internal integration token with access to pages you share with the integration.",
  },
] as const;

type TokenConnectorId = (typeof TOKEN_CONNECTORS)[number]["id"];

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
  const [connected, setConnected] = useState<Record<TokenConnectorId, boolean>>({
    todoist: false,
    github: false,
    notion: false,
  });
  const [draftTokens, setDraftTokens] = useState<Record<TokenConnectorId, string>>({
    todoist: "",
    github: "",
    notion: "",
  });

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const next: Record<TokenConnectorId, boolean> = { todoist: false, github: false, notion: false };
      for (const connector of TOKEN_CONNECTORS) {
        const status = await client.connectorStatus(connector.id);
        next[connector.id] = Boolean(status.configured);
      }
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

  async function saveToken(connectorId: TokenConnectorId, label: string) {
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

  async function removeToken(connectorId: TokenConnectorId, label: string) {
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

  return (
    <section className={embedded ? "connectors-subpanel" : "connectors-panel"}>
      {!embedded ? (
        <header>
          <h3>Token connectors</h3>
          <p>Paste personal API tokens — stored encrypted in your agent vault.</p>
        </header>
      ) : (
        <>
          <h4>Token connectors</h4>
          <p className="connectors-hint">Todoist, GitHub, and Notion via owner-supplied tokens.</p>
        </>
      )}

      {TOKEN_CONNECTORS.map((connector) => (
        <div key={connector.id} className="connectors-token-row">
          <div className="connectors-token-head">
            <strong>{connector.label}</strong>
            <span>{connected[connector.id] ? "Connected" : "Not configured"}</span>
          </div>
          <p className="connectors-hint">{connector.hint}</p>
          <div className="connectors-token-actions">
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
            <button
              type="button"
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

      {note ? <p className="connectors-note">{note}</p> : null}
    </section>
  );
}
