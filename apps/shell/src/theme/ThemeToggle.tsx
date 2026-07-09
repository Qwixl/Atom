import { useState } from "react";
import { applyAtomSkin, isAtomSkinId, type AtomSkinId } from "@qwixl/skin-default/tokens";
import { loadStringFromStorage, saveStringToStorage } from "@qwixl/shell-core";
import { syncNativeChrome } from "../native/syncNativeChrome.js";
import { IconMoon, IconSun } from "./ThemeIcons.js";

const SKIN_KEY = "atom-shell-skin";

function syncDataTheme(skin: AtomSkinId) {
  document.documentElement.setAttribute("data-theme", skin === "dark" ? "dark" : "light");
  void syncNativeChrome();
}

function readTheme(): AtomSkinId {
  const saved = loadStringFromStorage(SKIN_KEY);
  if (isAtomSkinId(saved)) return saved;
  return "minimal";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [skin, setSkin] = useState<AtomSkinId>(readTheme);
  const isDark = skin === "dark";

  return (
    <button
      type="button"
      className={className ?? "atom-btn atom-btn-icon"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      onClick={() => {
        const next: AtomSkinId = isDark ? "minimal" : "dark";
        applyAtomSkin(next);
        saveStringToStorage(SKIN_KEY, next);
        syncDataTheme(next);
        setSkin(next);
      }}
    >
      {isDark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

export function initDocumentTheme() {
  const skin =
    (document.documentElement.getAttribute("data-atom-skin") as AtomSkinId | null) ??
    readTheme();
  syncDataTheme(skin);
}
