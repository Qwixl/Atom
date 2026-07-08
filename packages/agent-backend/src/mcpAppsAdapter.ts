/**
 * MCP Apps SEP-1865 adapter — maps ui:// resources to Atom registry module installs.
 * Interop only (D068); owner-shell catalog + chrome remain the trust boundary.
 */

export interface McpAppsUiResource {
  uri: string;
  mimeType?: string;
  name?: string;
  description?: string;
}

export interface McpAppsToolDescriptor {
  name: string;
  description?: string;
  ui?: McpAppsUiResource;
}

export interface RegistryModuleRef {
  moduleId: string;
  bundleUrl: string;
  manifestUrl?: string;
}

/** Known MCP Apps ui:// prefix → Atom registry module id. */
const UI_URI_MODULE_MAP: Record<string, string> = {
  "ui://atom/media/audio-player": "media/audio-player",
  "ui://atom/media/video-call": "media/video-call",
  "ui://atom/games/tictactoe": "games/tictactoe",
};

export function mcpAppsUiUriToModuleId(uri: string): string | null {
  const trimmed = uri.trim();
  if (UI_URI_MODULE_MAP[trimmed]) return UI_URI_MODULE_MAP[trimmed];
  const match = /^ui:\/\/([^/]+)\/(.+)$/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

export function mcpAppsToolToRegistryRef(
  tool: McpAppsToolDescriptor,
  registryBase = "/registry",
): RegistryModuleRef | null {
  const ui = tool.ui;
  if (!ui?.uri?.trim()) return null;
  const moduleId = mcpAppsUiUriToModuleId(ui.uri);
  if (!moduleId) return null;
  const base = registryBase.replace(/\/$/, "");
  return {
    moduleId,
    bundleUrl: `${base}/${moduleId}/bundle/index.html`,
    manifestUrl: `${base}/${moduleId}/manifest.json`,
  };
}

export function isMcpAppsHtmlResource(resource: McpAppsUiResource): boolean {
  const mime = resource.mimeType?.trim().toLowerCase() ?? "";
  return mime === "text/html" || mime === "text/html;profile=mcp-app";
}
