import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

type McpServerSummary = {
  id: string;
  label: string;
  command: string;
  args: string[];
  allowedTools: string[];
};

type McpToolSummary = {
  name: string;
  description?: string;
};

export function McpSettingsPanel({
  vaultUnlocked = true,
  embedded = false,
}: {
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { config, client } = useAgentConfig(vaultUnlocked);
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [tools, setTools] = useState<McpToolSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const listed = await client.listMcpServers();
      setServers(listed.servers ?? []);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveServer() {
    const cmd = command.trim();
    if (!label.trim() || !cmd) return;
    setBusy(true);
    setNote("Saving MCP server on your agent…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Add MCP server",
        { command: cmd, label: label.trim() },
        config,
      );
      await client.addMcpServer({
        label: label.trim(),
        command: cmd,
        args: argsText.trim() || undefined,
        approvalRef,
      });
      setLabel("");
      setCommand("");
      setArgsText("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeServer(serverId: string) {
    setBusy(true);
    setNote("Removing MCP server…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Remove MCP server", { serverId }, config);
      await client.removeMcpServer(serverId, approvalRef);
      if (selectedId === serverId) {
        setSelectedId(null);
        setTools([]);
      }
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function loadTools(serverId: string) {
    setBusy(true);
    setNote(null);
    setSelectedId(serverId);
    try {
      const listed = await client.listMcpTools(serverId);
      setTools(listed.tools ?? []);
    } catch (error) {
      setTools([]);
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function allowlistDiscoveredTools(serverId: string) {
    if (tools.length === 0) return;
    setBusy(true);
    setNote("Saving tool allowlist…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Update MCP tool allowlist",
        { serverId, tools: tools.map((tool) => tool.name).join(", ") },
        config,
      );
      await client.setMcpAllowedTools(
        serverId,
        tools.map((tool) => tool.name),
        approvalRef,
      );
      setNote("Allowlist saved.");
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={embedded ? "settings-subpanel" : "settings-panel"}>
      <h3 className="settings-subtitle">MCP servers (stdio)</h3>
      <p className="settings-note">
        Owner-run MCP servers spawn on your agent backend. Chat uses <code>atom_mcp_invoke</code> when
        servers are configured. Empty allowlist = all tools permitted until you tighten.
      </p>
      <div className="settings-form-row">
        <label>
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
        </label>
        <label>
          Command
          <input value={command} onChange={(event) => setCommand(event.target.value)} disabled={busy} />
        </label>
        <label>
          Args (space-separated)
          <input value={argsText} onChange={(event) => setArgsText(event.target.value)} disabled={busy} />
        </label>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void saveServer()}>
          Add MCP server
        </button>
      </div>
      {note ? <p className="settings-note">{note}</p> : null}
      <ul className="settings-list">
        {servers.map((server) => (
          <li key={server.id}>
            <strong>{server.label}</strong> ({server.id}) — <code>{server.command}</code>{" "}
            {server.args.join(" ")}
            {server.allowedTools.length > 0 ? (
              <span> · allowlist: {server.allowedTools.join(", ")}</span>
            ) : (
              <span> · allowlist: all tools</span>
            )}
            <div className="settings-inline-actions">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void loadTools(server.id)}>
                List tools
              </button>
              {selectedId === server.id && tools.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void allowlistDiscoveredTools(server.id)}
                >
                  Allowlist listed tools
                </button>
              ) : null}
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void removeServer(server.id)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {selectedId && tools.length > 0 ? (
        <ul className="settings-list">
          {tools.map((tool) => (
            <li key={tool.name}>
              <code>{tool.name}</code>
              {tool.description ? ` — ${tool.description}` : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
