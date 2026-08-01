import type { McpToolDescriptor, McpReadResourceResult, McpResourceDescriptor } from "./types.js";

export function mapSdkTool(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
  _meta?: Record<string, unknown>;
}): McpToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    meta: tool._meta && typeof tool._meta === "object" ? { ...tool._meta } : undefined,
  };
}

export function mapSdkReadResource(result: {
  contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>;
}): McpReadResourceResult {
  return {
    contents: result.contents.map((entry) => ({
      uri: entry.uri,
      mimeType: entry.mimeType,
      text: entry.text,
      blob: entry.blob,
    })),
  };
}

export function mapSdkResource(resource: {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}): McpResourceDescriptor {
  return {
    uri: resource.uri,
    name: resource.name,
    description: resource.description,
    mimeType: resource.mimeType,
  };
}

/** Extract ui:// URIs from tool `_meta.ui.resourceUri` (MCP Apps). */
export function uiResourceUriFromToolMeta(meta: Record<string, unknown> | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  const ui = meta.ui;
  if (!ui || typeof ui !== "object" || Array.isArray(ui)) return null;
  const uri = (ui as Record<string, unknown>).resourceUri;
  if (typeof uri !== "string") return null;
  const trimmed = uri.trim();
  return trimmed.startsWith("ui://") ? trimmed : null;
}
