import { resolveModuleBundleOrigin } from "@qwixl/shell-core";
import { readAtomThemeTokens } from "@qwixl/skin-default/tokens";
import { resolveModuleBundleUrl } from "./resolveModuleBundleUrl.js";

/** v1 module sandbox: scripts only — never allow-same-origin (parent storage isolation). */
export const MODULE_IFRAME_SANDBOX = "allow-scripts";

export interface ModuleBridge {
  targetOrigin: string;
  sendInit: (contentWindow: Window, props: Record<string, unknown>) => void;
  isAllowedMessageOrigin: (origin: string) => boolean;
}

export function createModuleBridge(bundleUrl: string): ModuleBridge {
  const resolvedUrl = resolveModuleBundleUrl(bundleUrl);
  const shellOrigin = window.location.origin;
  const bundleOrigin = resolveModuleBundleOrigin(resolvedUrl, shellOrigin);

  return {
    targetOrigin: bundleOrigin,
    sendInit(contentWindow, props) {
      // MODULE_IFRAME_SANDBOX never grants allow-same-origin, so the frame's origin is
      // always opaque — whatever host served the bundle. postMessage cannot address an
      // opaque origin, so "*" is the only target that is ever delivered. Callers must
      // authenticate with event.source === iframe.contentWindow, and must not put
      // secrets in props: a module can navigate its own frame.
      contentWindow.postMessage({ type: "init", props, theme: readAtomThemeTokens() }, "*");
    },
    isAllowedMessageOrigin(origin: string) {
      // An opaque-origin frame reports "null". bundleOrigin is kept for a same-origin
      // bundle in a frame that is not sandboxed.
      return origin === "null" || origin === bundleOrigin;
    },
  };
}

export { resolveModuleBundleUrl } from "./resolveModuleBundleUrl.js";
