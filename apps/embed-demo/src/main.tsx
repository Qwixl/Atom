import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { PlaygroundApp } from "./PlaygroundApp.js";
import "./styles.css";

const playground = new URLSearchParams(window.location.search).has("playground");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{playground ? <PlaygroundApp /> : <App />}</StrictMode>,
);
