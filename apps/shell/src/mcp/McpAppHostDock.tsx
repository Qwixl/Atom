/**
 * Opens attested MCP App surfaces after a successful tools/call (D131 §14.1).
 * Not a feed surface / A2UI path.
 */

import { useCallback, useState } from "react";
import { toolAllowsAppVisibility } from "@qwixl/shell-core";
import { McpAppHost } from "./McpAppHost.js";
import type { CommsAgentClient } from "../comms/client.js";

const MAX_FRAMES = 4;

export type McpAppSurface = {
  key: string;
  serverId: string;
  serverLabel: string;
  uri: string;
  htmlWithCsp: string;
  contentHash: string;
  allowedTools: string[];
  safeTools: string[];
  pinnedUris: string[];
  appVisibleTools: string[];
  stale?: boolean;
};

export function useMcpAppSurfaces() {
  const [surfaces, setSurfaces] = useState<McpAppSurface[]>([]);

  const dismiss = useCallback((key: string) => {
    setSurfaces((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const openFromToolCall = useCallback(
    async (
      client: CommsAgentClient,
      call: { serverId: string; toolName: string },
    ): Promise<void> => {
      const listed = await client.listMcpServers();
      const server = listed.servers.find((s) => s.id === call.serverId);
      if (!server?.trusted || !server.enabled) return;
      if (!server.allowedTools.length) return;

      const tools = await client.listMcpTools(call.serverId);
      const tool = tools.tools.find((t) => t.name === call.toolName);
      const uri = tool?.ui?.uri?.trim();
      if (!uri?.startsWith("ui://")) return;
      // Atom registry modules stay on ModuleFrameView — skip third-party host for ui://atom/
      if (/^ui:\/\/atom\//i.test(uri)) return;

      const resource = await client.readMcpUiResource(call.serverId, uri);
      const appVisibleTools = tools.tools
        .filter((t) => toolAllowsAppVisibility(t.visibility))
        .map((t) => t.name);

      const key = `${call.serverId}:${uri}:${resource.contentHash.slice(0, 12)}`;
      setSurfaces((prev) => {
        const next: McpAppSurface = {
          key,
          serverId: call.serverId,
          serverLabel: server.label,
          uri,
          htmlWithCsp: resource.htmlWithCsp,
          contentHash: resource.contentHash,
          allowedTools: [...server.allowedTools],
          safeTools: [...(server.safeTools ?? [])],
          pinnedUris: resource.pinnedUris,
          appVisibleTools,
        };
        const withoutDup = prev.filter((s) => s.key !== key);
        return [...withoutDup, next].slice(-MAX_FRAMES);
      });
    },
    [],
  );

  return { surfaces, dismiss, openFromToolCall };
}

export function McpAppHostDock(props: {
  surfaces: McpAppSurface[];
  onDismiss: (key: string) => void;
  onProxyTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  onProxyResource: (serverId: string, uri: string) => Promise<unknown>;
  onApprovedChatMessage?: (text: string) => void;
}) {
  if (props.surfaces.length === 0) return null;
  return (
    <div className="mcp-app-dock" aria-label="MCP Apps">
      {props.surfaces.map((surface) => (
        <div key={surface.key} className="mcp-app-dock__item">
          <div className="mcp-app-dock__bar">
            <span>Third-party MCP App (untrusted)</span>
            <button type="button" onClick={() => props.onDismiss(surface.key)}>
              Close
            </button>
          </div>
          <McpAppHost
            serverId={surface.serverId}
            serverLabel={surface.serverLabel}
            uri={surface.uri}
            htmlWithCsp={surface.htmlWithCsp}
            contentHash={surface.contentHash}
            stale={surface.stale}
            allowedTools={surface.allowedTools}
            safeTools={surface.safeTools}
            pinnedUris={surface.pinnedUris}
            appVisibleTools={surface.appVisibleTools}
            onProxyTool={(toolName, args) => props.onProxyTool(surface.serverId, toolName, args)}
            onProxyResource={(uri) => props.onProxyResource(surface.serverId, uri)}
            onApprovedChatMessage={props.onApprovedChatMessage}
          />
        </div>
      ))}
    </div>
  );
}
