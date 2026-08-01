/**
 * MCP Apps host policy (D131 / MCPA-02) — pure functions, no I/O.
 */

export const MCP_APP_MAX_HTML_BYTES = 1_048_576;
export const MCP_APP_READ_TIMEOUT_MS = 10_000;

export function isUiSchemeUri(uri: string): boolean {
  return uri.trim().startsWith("ui://");
}

export function isMcpAppHtmlMime(mimeType: string | undefined): boolean {
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (!mime) return false;
  const base = mime.split(";")[0]?.trim() ?? "";
  if (base !== "text/html") return false;
  // profile=mcp-app is recommended but not required when base is text/html
  return true;
}

export function assertMcpAppHtmlMime(mimeType: string | undefined): void {
  if (!isMcpAppHtmlMime(mimeType)) {
    throw new Error(
      `MCP App resource MIME must be text/html or text/html;profile=mcp-app (got ${mimeType ?? "missing"})`,
    );
  }
}

export function assertMcpAppHtmlSize(html: string): void {
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > MCP_APP_MAX_HTML_BYTES) {
    throw new Error(`MCP App HTML exceeds ${MCP_APP_MAX_HTML_BYTES} bytes (${bytes})`);
  }
}

/** Snapshot of ui:// URIs declared by a server (tools + resources). */
export function buildUiUriPinSet(opts: {
  toolUiUris: readonly string[];
  resourceUris?: readonly string[];
}): Set<string> {
  const set = new Set<string>();
  for (const uri of opts.toolUiUris) {
    if (isUiSchemeUri(uri)) set.add(uri.trim());
  }
  for (const uri of opts.resourceUris ?? []) {
    if (isUiSchemeUri(uri)) set.add(uri.trim());
  }
  return set;
}

export function assertUriPinned(uri: string, pin: ReadonlySet<string>): void {
  const trimmed = uri.trim();
  if (!isUiSchemeUri(trimmed)) {
    throw new Error(`MCP App template URI must use ui:// scheme (got ${trimmed})`);
  }
  if (!pin.has(trimmed)) {
    throw new Error(`MCP App URI not declared by this server: ${trimmed}`);
  }
}

/** UI host requires non-empty allowedTools (D131 §14.3). */
export function assertMcpAppAllowlistForUi(allowedTools: readonly string[]): void {
  if (allowedTools.length === 0) {
    throw new Error(
      "MCP Apps host requires a non-empty allowedTools list before rendering UI",
    );
  }
}

/**
 * Whether a View-initiated tools/call may auto-proxy without confirm chrome.
 * safeTools is prohibited when allowedTools is empty.
 */
export function isSafeToolAutoProxy(
  toolName: string,
  allowedTools: readonly string[],
  safeTools: readonly string[] | undefined,
): boolean {
  if (allowedTools.length === 0) return false;
  if (!safeTools?.length) return false;
  const name = toolName.trim();
  if (!name) return false;
  if (!allowedTools.includes(name)) return false;
  return safeTools.includes(name);
}

export interface McpAppCspDomains {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

/** Build a restrictive CSP string from declared domains; never loosen past declaration. */
export function buildMcpAppCsp(
  declared: McpAppCspDomains | undefined,
  opts: { allowUnsafeInline?: boolean } = {},
): string {
  const allowInline = opts.allowUnsafeInline !== false;
  const sanitize = (domains: string[] | undefined, fallback: string): string => {
    if (!domains?.length) return fallback;
    const cleaned = domains
      .map((d) => d.trim())
      .filter((d) => d && d !== "*" && !d.includes("*"));
    return cleaned.length ? cleaned.join(" ") : fallback;
  };
  const connect = sanitize(declared?.connectDomains, "'none'");
  const img = sanitize(declared?.resourceDomains, "'none'");
  const frame = sanitize(declared?.frameDomains, "'none'");
  const base = sanitize(declared?.baseUriDomains, "'self'");
  const scriptSrc = allowInline ? "'unsafe-inline'" : "'none'";
  return [
    `default-src 'none'`,
    `script-src ${scriptSrc}`,
    `style-src 'unsafe-inline'`,
    `img-src ${img}`,
    `font-src ${img}`,
    `media-src ${img}`,
    `connect-src ${connect}`,
    `frame-src ${frame}`,
    `base-uri ${base}`,
    `object-src 'none'`,
  ].join("; ");
}

export function wrapHtmlWithCsp(html: string, csp: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, "&quot;")}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  }
  return `<!DOCTYPE html><html><head>${meta}</head><body>${html}</body></html>`;
}

/** Bridge method allowlist (View → Host). */
export const MCP_APP_BRIDGE_METHODS = new Set([
  "ui/initialize",
  "ping",
  "tools/call",
  "resources/read",
  "notifications/message",
  "ui/message",
  "ui/notifications/size-changed",
]);

export function isMcpAppBridgeMethodAllowed(method: string): boolean {
  return MCP_APP_BRIDGE_METHODS.has(method);
}

/** Registry mapper may only claim ui://atom/… (D131 §14.9). */
export function isAtomUiRegistryUri(uri: string): boolean {
  return /^ui:\/\/atom\//i.test(uri.trim());
}
