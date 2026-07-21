import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Remote-load shell (BK-39).
 *
 * The store binary is a thin WebView. UI ships from the hosted shell so web
 * deploys reach phones without a Play Store update.
 *
 * Capacitor documents `server.url` as live-reload-only; Atom uses it
 * deliberately for this wrapper model. See docs/06-decisions-log.md (D076).
 *
 * Override for local shell testing:
 *   ATOM_NATIVE_SERVER_URL=http://10.0.2.2:5200/  pnpm sync
 * (10.0.2.2 = Android emulator → host loopback)
 */
const serverUrl =
  process.env.ATOM_NATIVE_SERVER_URL?.trim() || "https://atom.qwixl.com/app/";

const config: CapacitorConfig = {
  appId: "com.qwixl.atom",
  appName: "Atom",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: [
      "atom.qwixl.com",
      "*.atom.qwixl.com",
      "control.atom.qwixl.com",
      "atom.registry.qwixl.com",
      "atom.apps.qwixl.com",
    ],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#000000",
    },
  },
};

export default config;
