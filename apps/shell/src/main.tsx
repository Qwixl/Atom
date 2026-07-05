import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@qwixl/skin-default/default.css";
import "@qwixl/skin-default/dark.css";
import "@qwixl/skin-default/high-contrast.css";
import { applyAtomSkin } from "@qwixl/skin-default/tokens";
import { loadStringFromStorage } from "@qwixl/shell-core";
import { App } from "./App.js";
import "./shell-tokens.css";
import "./shell/shell-chrome.css";
import "./shell/panel-layout.css";
import "./styles.css";

const SKIN_KEY = "atom-shell-skin";
const savedSkin = loadStringFromStorage(SKIN_KEY);
if (savedSkin === "dark" || savedSkin === "high-contrast" || savedSkin === "default") {
  applyAtomSkin(savedSkin);
} else {
  applyAtomSkin("default");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
