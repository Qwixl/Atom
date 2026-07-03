import type { JsonValue } from "@atom/shell-core";

/** Stakes classification for a preference record. See docs/02-architecture/08-preference-evidence.md. */
export type PreferenceTier = "constraint" | "preference" | "taste";

const CONSTRAINT_RE =
  /\b(allerg(y|ies|ic)|anaphyla|gluten[- ]?free|nut[- ]?free|peanut|lactose|kosher|halal|wheelchair|accessibility|disabilit|medical|insulin|epipen|life[- ]?threatening|severe reaction)\b/i;

const TASTE_RE =
  /\b(today|this time|for now|right now|feeling like|just want|this trip only|one[- ]?off)\b/i;

const TASTE_CATEGORIES = new Set(["food-order", "lunch", "coffee-order", "meal-today"]);

function textOf(value: JsonValue): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "";
  return JSON.stringify(value);
}

export function normalizeTier(raw: unknown): PreferenceTier | undefined {
  if (raw === "constraint" || raw === "preference" || raw === "taste") return raw;
  return undefined;
}

/** Heuristic tier when curator or manual entry did not classify. */
export function inferTier(input: {
  category: string;
  label: string;
  value: JsonValue;
}): PreferenceTier {
  const category = input.category.trim().toLowerCase();
  const combined = `${input.label} ${textOf(input.value)}`;

  if (
    category === "health" ||
    category.includes("allerg") ||
    category.includes("dietary-restriction") ||
    CONSTRAINT_RE.test(combined)
  ) {
    return "constraint";
  }

  if (TASTE_RE.test(combined) || TASTE_CATEGORIES.has(category)) {
    return "taste";
  }

  return "preference";
}

export function resolveTier(
  explicit: unknown,
  input: { category: string; label: string; value: JsonValue },
): PreferenceTier {
  return normalizeTier(explicit) ?? inferTier(input);
}
