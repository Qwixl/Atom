import { resolveModuleBundleOrigin } from "@qwixl/shell-core";

/** v1 module sandbox: scripts only — never allow-same-origin (parent storage isolation). */
export const MODULE_IFRAME_SANDBOX = "allow-scripts";

export interface ModuleBridge {
  targetOrigin: string;
  sendInit: (contentWindow: Window, props: Record<string, unknown>) => void;
  isAllowedMessageOrigin: (origin: string) => boolean;
}

export function createModuleBridge(bundleUrl: string): ModuleBridge {
  const shellOrigin = window.location.origin;
  const bundleOrigin = resolveModuleBundleOrigin(bundleUrl, shellOrigin);
  const crossOrigin = bundleOrigin !== shellOrigin;

  return {
    targetOrigin: bundleOrigin,
    sendInit(contentWindow, props) {
      // Sandboxed iframes without allow-same-origin use an opaque origin; init uses "*"
      // only for same-site bundle URLs (local dev). Cross-origin targets the bundle origin.
      const target = crossOrigin ? bundleOrigin : "*";
      contentWindow.postMessage({ type: "init", props, theme: {} }, target);
    },
    isAllowedMessageOrigin(origin: string) {
      if (crossOrigin) return origin === bundleOrigin;
      return origin === "null" || origin === bundleOrigin;
    },
  };
}
