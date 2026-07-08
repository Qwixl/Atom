import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

type McpTransportKind = "stdio" | "streamable-http";

type McpServerSummary = {
  id: string;
  label: string;
  transport: McpTransportKind;
  command?: string;
  args: string[];
  url?: string;
  hasAuthHeaders?: boolean;
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
  const [transport, setTransport] = useState<McpTransportKind>("stdio");
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [url, setUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
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
    if (!label.trim()) return;
    if (transport === "stdio" && !command.trim()) return;
    if (transport === "streamable-http" && !url.trim()) return;
    setBusy(true);
    setNote("Saving MCP server on your agent…");
    try {
      const approvalRef = await approvalRefForConnectorWrite(
        "Add MCP server",
        transport === "stdio" ? { command: command.trim(), label: label.trim() } : { url: url.trim(), label: label.trim() },
        config,
      );
      await client.addMcpServer({
        label: label.trim(),
        transport,
        command: transport === "stdio" ? command.trim() : undefined,
        args: transport === "stdio" ? argsText.trim() || undefined : undefined,
        url: transport === "streamable-http" ? url.trim() : undefined,
        authHeader: transport === "streamable-http" ? authHeader.trim() || undefined : undefined,
        approvalRef,
      });
      setLabel("");
      setCommand("");
      setArgsText("");
      setUrl("");
      setAuthHeader("");
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

  const canSave =
    label.trim() &&
    ((transport === "stdio" && command.trim()) || (transport === "streamable-http" && url.trim()));

  return (
    <section className={embedded ? "settings-subpanel" : "settings-panel"}>
      <h3 className="settings-subtitle">MCP servers</h3>
      <p className="settings-note">
        Owner-run MCP servers on your agent backend — stdio spawn or remote Streamable HTTP. Chat uses{" "}
        <code>atom_mcp_invoke</code> when servers are configured. Empty allowlist = all tools permitted until you tighten.
      </p>
      <div className="settings-form-row">
        <label>
          Transport
          <select
            value={transport}
            onChange={(event) => setTransport(event.target.value as McpTransportKind)}
            disabled={busy}
          >
            <option value="stdio">stdio (local command)</option>
            <option value="streamable-http">Streamable HTTP (remote URL)</option>
          </select>
        </label>
        <label>
          Label
          <input value={label} onChange={(event) => setLabel(event.target.value)} disabled={busy} />
        </label>
        {transport === "stdio" ? (
          <>
            <label>
              Command
              <input value={command} onChange={(event) => setCommand(event.target.value)} disabled={busy} />
            </label>
            <label>
              Args (space-separated)
              <input value={argsText} onChange={(event) => setArgsText(event.target.value)} disabled={busy} />
            </label>
          </>
        ) : (
          <>
            <label>
              Server URL
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
                placeholder="https://example.com/mcp"
              />
            </label>
            <label>
              Authorization header (optional)
              <input
                value={authHeader}
                onChange={(event) => setAuthHeader(event.target.value)}
                disabled={busy}
                placeholder="Bearer …"
                type="password"
                autoComplete="off"
              />
            </label>
          </>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || !canSave} onClick={() => void saveServer()}>
          Add MCP server
        </button>
      </div>
      {note ? <p className="settings-note">{note}</p> : null}
      <ul className="settings-list">
        {servers.map((server) => (
          <li key={server.id}>
            <strong>{server.label}</strong> ({server.id}) — {server.transport}
            {server.transport === "streamable-http" ? (
              <>
                {" "}
                <code>{server.url}</code>
                {server.hasAuthHeaders ? " · auth configured" : null}
              </>
            ) : (
              <>
                {" "}
                <code>{server.command}</code> {server.args.join(" ")}
              </>
            )}
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
