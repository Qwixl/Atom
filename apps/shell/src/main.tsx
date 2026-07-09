import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@qwixl/skin-default/minimal.css";
import "@qwixl/skin-default/default.css";
import "@qwixl/skin-default/dark.css";
import "@qwixl/skin-default/high-contrast.css";
import "@qwixl/skin-default/primitives.css";
import { applyAtomSkin, isAtomSkinId } from "@qwixl/skin-default/tokens";
import { loadStringFromStorage } from "@qwixl/shell-core";
import { RootApp } from "./RootApp.js";
import "./fonts.css";
import "./shell-tokens.css";
import "./atom-ui.css";
import "./shell/shell-chrome.css";
import "./shell/panel-layout.css";
import "./shell/atom-panels.css";
import "./demo/demo-session.css";
import "./shell/atom-shell.css";
import "./shell/shell-unified.css";
import "./styles.css";
import { initDocumentTheme } from "./theme/ThemeToggle.js";

const SKIN_KEY = "atom-shell-skin";
const savedSkin = loadStringFromStorage(SKIN_KEY);
if (isAtomSkinId(savedSkin)) {
  applyAtomSkin(savedSkin);
} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  applyAtomSkin("dark");
} else {
  applyAtomSkin("minimal");
}

initDocumentTheme();

void import("./native/syncNativeChrome.js").then(({ syncNativeChrome }) => {
  void syncNativeChrome();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
);
