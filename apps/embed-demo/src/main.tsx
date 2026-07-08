import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@qwixl/skin-default/minimal.css";
import "@qwixl/skin-default/default.css";
import "@qwixl/skin-default/dark.css";
import "@qwixl/skin-default/high-contrast.css";
import "@qwixl/skin-default/primitives.css";
import { applyAtomSkin } from "@qwixl/skin-default/tokens";
import { App } from "./App.js";
import { PlaygroundApp } from "./PlaygroundApp.js";
import "./styles.css";

const playground = new URLSearchParams(window.location.search).has("playground");

if (playground) {
  applyAtomSkin("minimal");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{playground ? <PlaygroundApp /> : <App />}</StrictMode>,
);
