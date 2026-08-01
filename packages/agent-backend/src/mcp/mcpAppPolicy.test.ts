import { describe, expect, it } from "vitest";
import {
  assertMcpAppAllowlistForUi,
  assertMcpAppHtmlMime,
  assertMcpAppHtmlSize,
  assertUriPinned,
  buildMcpAppCsp,
  buildUiUriPinSet,
  isAtomUiRegistryUri,
  isMcpAppBridgeMethodAllowed,
  isSafeToolAutoProxy,
  MCP_APP_MAX_HTML_BYTES,
  wrapHtmlWithCsp,
} from "./mcpAppPolicy.js";

describe("mcpAppPolicy", () => {
  it("accepts text/html MIME variants", () => {
    expect(() => assertMcpAppHtmlMime("text/html")).not.toThrow();
    expect(() => assertMcpAppHtmlMime("text/html;profile=mcp-app")).not.toThrow();
    expect(() => assertMcpAppHtmlMime("application/json")).toThrow(/MIME/);
  });

  it("rejects oversize HTML", () => {
    const big = "x".repeat(MCP_APP_MAX_HTML_BYTES + 1);
    expect(() => assertMcpAppHtmlSize(big)).toThrow(/exceeds/);
  });

  it("pins ui:// URIs and rejects cross-server or http", () => {
    const pin = buildUiUriPinSet({
      toolUiUris: ["ui://demo/view"],
      resourceUris: ["ui://demo/other"],
    });
    expect(() => assertUriPinned("ui://demo/view", pin)).not.toThrow();
    expect(() => assertUriPinned("ui://evil/x", pin)).toThrow(/not declared/);
    expect(() => assertUriPinned("https://evil.example/", pin)).toThrow(/ui:\/\//);
  });

  it("requires non-empty allowedTools for UI host", () => {
    expect(() => assertMcpAppAllowlistForUi([])).toThrow(/non-empty/);
    expect(() => assertMcpAppAllowlistForUi(["show"])).not.toThrow();
  });

  it("safeTools auto-proxy only when allowlisted and non-empty allowedTools", () => {
    expect(isSafeToolAutoProxy("show", [], ["show"])).toBe(false);
    expect(isSafeToolAutoProxy("show", ["show"], undefined)).toBe(false);
    expect(isSafeToolAutoProxy("show", ["show"], ["show"])).toBe(true);
    expect(isSafeToolAutoProxy("write", ["show", "write"], ["show"])).toBe(false);
  });

  it("builds deny-by-default CSP and never invents wildcards", () => {
    const csp = buildMcpAppCsp(undefined);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain("*");
  });

  it("strips wildcard CSP domains instead of honouring exfil", () => {
    const csp = buildMcpAppCsp({
      connectDomains: ["*", "https://evil.example"],
      resourceDomains: ["https://cdn.example"],
    });
    expect(csp).toContain("connect-src https://evil.example");
    expect(csp).not.toMatch(/connect-src[^;]*\*/);
  });

  it("injects CSP meta into HTML", () => {
    const out = wrapHtmlWithCsp("<html><head></head><body>hi</body></html>", "default-src 'none'");
    expect(out).toContain('http-equiv="Content-Security-Policy"');
  });

  it("allowlists bridge methods", () => {
    expect(isMcpAppBridgeMethodAllowed("tools/call")).toBe(true);
    expect(isMcpAppBridgeMethodAllowed("ui/message")).toBe(true);
    expect(isMcpAppBridgeMethodAllowed("ui/notifications/sandbox-ready")).toBe(false);
  });

  it("limits registry mapper to ui://atom/", () => {
    expect(isAtomUiRegistryUri("ui://atom/media/audio-player")).toBe(true);
    expect(isAtomUiRegistryUri("ui://third/party")).toBe(false);
  });
});
