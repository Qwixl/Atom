/** Serializable theme payload for module iframe init (values only). */
export const ATOM_THEME_KEYS = [
  "colorBg",
  "colorBgRaised",
  "colorText",
  "colorTextDim",
  "colorAccent",
  "colorGood",
  "colorWarn",
  "colorBad",
  "radiusMd",
  "fontSans",
] as const;

export type AtomThemeKey = (typeof ATOM_THEME_KEYS)[number];
export type AtomThemeTokens = Partial<Record<AtomThemeKey, string>>;

const CSS_MAP: Record<AtomThemeKey, string> = {
  colorBg: "--atom-color-bg",
  colorBgRaised: "--atom-color-bg-raised",
  colorText: "--atom-color-text",
  colorTextDim: "--atom-color-text-dim",
  colorAccent: "--atom-color-accent",
  colorGood: "--atom-color-good",
  colorWarn: "--atom-color-warn",
  colorBad: "--atom-color-bad",
  radiusMd: "--atom-radius-md",
  fontSans: "--atom-font-sans",
};

export function readAtomThemeTokens(from: Element = document.documentElement): AtomThemeTokens {
  const style = getComputedStyle(from);
  const tokens: AtomThemeTokens = {};
  for (const key of ATOM_THEME_KEYS) {
    const value = style.getPropertyValue(CSS_MAP[key]).trim();
    if (value) tokens[key] = value;
  }
  return tokens;
}

export type AtomSkinId = "minimal" | "default" | "dark" | "high-contrast";

export const ATOM_SKINS: { id: AtomSkinId; label: string }[] = [
  { id: "minimal", label: "Minimal (template)" },
  { id: "default", label: "Default (warm)" },
  { id: "dark", label: "Dark" },
  { id: "high-contrast", label: "High contrast" },
];

export function applyAtomSkin(skinId: AtomSkinId): void {
  document.documentElement.dataset.atomSkin = skinId;
}

export function isAtomSkinId(value: string | null | undefined): value is AtomSkinId {
  return value === "minimal" || value === "default" || value === "dark" || value === "high-contrast";
}
