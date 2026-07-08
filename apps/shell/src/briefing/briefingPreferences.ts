/** F6-1 foundation: owner briefing preferences (local until owner-store tier ships). */
export interface BriefingPreferences {
  enabled: boolean;
  /** Topic labels the owner cares about in roundups (e.g. politics, tech). */
  topics: string[];
  /** Optional local time hint, HH:MM 24h — trigger wiring is F6-1. */
  preferredTime?: string;
}

const STORAGE_KEY = "atom.briefing.preferences";

export function loadBriefingPreferences(): BriefingPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, topics: [] };
    const parsed = JSON.parse(raw) as Partial<BriefingPreferences>;
    return {
      enabled: parsed.enabled === true,
      topics: Array.isArray(parsed.topics)
        ? parsed.topics.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        : [],
      preferredTime:
        typeof parsed.preferredTime === "string" ? parsed.preferredTime.trim() : undefined,
    };
  } catch {
    return { enabled: false, topics: [] };
  }
}

export function saveBriefingPreferences(prefs: BriefingPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** Merge curator-learned topic into briefing prefs when enabled (F6-2 hook). */
export function rememberBriefingTopic(topic: string): BriefingPreferences {
  const trimmed = topic.trim();
  const current = loadBriefingPreferences();
  if (!trimmed || current.topics.includes(trimmed)) return current;
  const next = { ...current, topics: [...current.topics, trimmed].slice(-20) };
  saveBriefingPreferences(next);
  return next;
}
