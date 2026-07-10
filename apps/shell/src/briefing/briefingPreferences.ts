/** F6-1 foundation: owner briefing preferences (local until owner-store tier ships). */

/** Max headlines in the "Topics you follow" briefing card after agent curation. */
export const BRIEFING_TOPIC_HEADLINE_CAP = 5;

/** Max headlines from subscribed RSS in a daily briefing. */
export const BRIEFING_RSS_HEADLINE_CAP = 5;

/** Candidate pool per topic from news-search before curation. */
export const BRIEFING_TOPIC_SEARCH_POOL = 8;

/** Auto-sent once per session when briefing is enabled and Live LLM is active. */
export const BRIEFING_OPEN_MESSAGE =
  "[briefing-open] One briefing-daily composition (core/stack of cards): Today calendar card even if empty, up to 5 RSS headlines with links, up to 5 curated topic headlines from news-search. Single JSON turn — no headline lists in text.";

/**
 * Sent when a standing-intent daily-briefing fires (Agent Brain → Chat composition).
 * Same composition contract as BRIEFING_OPEN_MESSAGE; distinct tag so session-open
 * and brain-fire can be guarded independently.
 */
export const BRIEFING_FIRE_MESSAGE =
  "[briefing-fire] One briefing-daily composition (core/stack of cards): Today calendar card even if empty, up to 5 RSS headlines with links, up to 5 curated topic headlines from news-search. Single JSON turn — no headline lists in text.";

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

export function formatBriefingContextForPrompt(
  prefs: BriefingPreferences,
  interestThemeHints: readonly string[] = [],
): string | undefined {
  if (prefs.topics.length === 0 && interestThemeHints.length === 0) return undefined;
  const topics =
    prefs.topics.length > 0
      ? prefs.topics.join(", ")
      : "(none configured yet — use emerging interest themes below as soft hints)";
  const interestLine =
    interestThemeHints.length > 0
      ? `Emerging interest themes from exploration graph (soft ranking signal, not hard prefs): ${interestThemeHints.join(", ")}.`
      : null;
  return [
    `Owner briefing topics (separate from subscribed RSS feeds): ${topics}.`,
    interestLine,
    `Call atom_connector_invoke news-search searchItems with input { query: "<topic>", limit: ${BRIEFING_TOPIC_SEARCH_POOL} } for each topic (candidate pool).`,
    `Present at most ${BRIEFING_TOPIC_HEADLINE_CAP} headlines total in Topics you follow after ranking — not ${BRIEFING_TOPIC_SEARCH_POOL} or more.`,
    "Ranking signals: owner profile records (tier, confidence, strength), retrieved memory and past link explorations / interest connections, recency, topic relevance.",
    "Reserve 1–2 slots for major breaking stories (elections, disasters, war, market shocks) even without profile match — highlight interests without insulating the owner.",
    "Never relabel unrelated RSS headlines as topic news.",
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");
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

/** Apply curator proposals in category briefing-topics when briefing is enabled (F6-2). */
export function applyCuratorBriefingTopics(
  proposals: ReadonlyArray<{ category: string; label: string; value: unknown }>,
): BriefingPreferences {
  const prefs = loadBriefingPreferences();
  if (!prefs.enabled || proposals.length === 0) return prefs;
  let next = prefs;
  for (const proposal of proposals) {
    const category = proposal.category.trim().toLowerCase();
    if (category !== "briefing-topics" && category !== "briefing") continue;
    const topic =
      typeof proposal.value === "string" && proposal.value.trim()
        ? proposal.value.trim()
        : proposal.label.trim();
    if (topic) next = rememberBriefingTopic(topic);
  }
  return next;
}
