/** Soft-confirm settings proposals from chat (track topic / RSS / watch). */

import type { ConsequentialAction, FeedItem, JsonObject } from "@qwixl/shell-core";

const STORAGE_KEY = "atom.settings.pendingProposal";
const MAX_AGE_MS = 30 * 60 * 1000;

const TRACK_REQUEST_HINT =
  /\b(track|alert|watch|daily update|keep me updated|fluctuat|briefing|follow|subscribe|price)\b/i;

export interface PendingSettingsProposal {
  id: string;
  createdAt: string;
  /** Short owner-facing summary for passkey chrome / local ack. */
  summary: string;
  rss?: { url: string; label: string };
  topic?: string;
  watch?: { query: string; everyMinutes: number };
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 24 * 60);
}

/** True when consequential-action terms mark a soft-confirm settings bundle. */
export function isSettingsProposalTerms(terms: JsonObject | undefined): boolean {
  if (!terms || typeof terms !== "object") return false;
  return terms.settingsProposal === true || terms.settingsProposal === "true";
}

/** Parse agent consequential-action into a pending proposal, or null. */
export function parseSettingsProposalFromAction(
  action: ConsequentialAction,
): PendingSettingsProposal | null {
  if (!isSettingsProposalTerms(action.terms)) return null;
  const terms = action.terms;
  const url = asString(terms.url);
  const label = asString(terms.label) ?? asString(terms.feedLabel);
  const topic = asString(terms.topic);
  const watchQuery = asString(terms.watchQuery) ?? asString(terms.query);
  const everyMinutes = asPositiveInt(terms.everyMinutes, 60);
  const summary =
    asString(terms.summary) ??
    asString(action.title) ??
    "Keep me updated with the proposed feed, topic, and alerts";

  if (!url && !topic && !watchQuery) return null;

  const proposal: PendingSettingsProposal = {
    id: action.id || crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    summary,
  };
  if (url) {
    proposal.rss = { url, label: label ?? "Feed" };
  }
  if (topic) proposal.topic = topic;
  if (watchQuery) {
    proposal.watch = { query: watchQuery, everyMinutes };
  }
  return proposal;
}

export function loadPendingSettingsProposal(now = Date.now()): PendingSettingsProposal | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSettingsProposal;
    if (!parsed?.id || !parsed.createdAt) {
      clearPendingSettingsProposal();
      return null;
    }
    const age = now - new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
      clearPendingSettingsProposal();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePendingSettingsProposal(proposal: PendingSettingsProposal): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(proposal));
  } catch {
    /* private mode */
  }
}

export function clearPendingSettingsProposal(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

/** Casual assent to a soft-confirm proposal (not a hard "Approve" chrome click). */
export function isSoftAssentMessage(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (!t || t.length > 120) return false;
  if (
    /^(no|nope|nah|not now|don'?t|do not|cancel|stop|never mind|nevermind|no thanks)\b/.test(t)
  ) {
    return false;
  }
  if (
    /^(yes|yep|yeah|yup|ok|okay|sure|fine|go ahead|please do|do it|sounds good|that works|perfect|great)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(that'?s fine|thats fine|that is fine)(\s|,|$)/.test(t)) return true;
  if (/^(that'?s fine|thats fine|all good|works for me).{0,40}thanks?\b/.test(t)) return true;
  if (/^thanks?( you)?[,.]?\s*(that'?s fine|thats fine|yes|ok|okay)?$/.test(t)) return true;
  if (/\b(keep me updated|go ahead|set (it|that) up)\b/.test(t) && t.length < 80) return true;
  return false;
}

/** Soft decline / dismiss pending proposal. */
export function isSoftDeclineMessage(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (!t || t.length > 120) return false;
  return /^(no|nope|nah|not now|don'?t|do not|cancel|stop|never mind|nevermind|no thanks|not interested)\b/.test(
    t,
  );
}

/** Passkey chrome terms restating the bundle. */
export function settingsProposalCustodyTerms(proposal: PendingSettingsProposal): Record<string, string> {
  const terms: Record<string, string> = {
    summary: proposal.summary,
  };
  if (proposal.rss) {
    terms.rssUrl = proposal.rss.url;
    terms.rssLabel = proposal.rss.label;
  }
  if (proposal.topic) terms.topic = proposal.topic;
  if (proposal.watch) {
    terms.watchQuery = proposal.watch.query;
    terms.everyMinutes = String(proposal.watch.everyMinutes);
  }
  return terms;
}

export function formatSettingsProposalAck(proposal: PendingSettingsProposal): string {
  const parts: string[] = [];
  if (proposal.rss) parts.push(`feed “${proposal.rss.label}”`);
  if (proposal.topic) parts.push(`briefing topic “${proposal.topic}”`);
  if (proposal.watch) parts.push(`watch for “${proposal.watch.query}”`);
  if (parts.length === 0) return "You're set — I'll keep an eye on that.";
  return `You're set — saved ${parts.join(", ")}. I'll use these in briefings and alerts.`;
}

function deriveTopicFromTrackRequest(text: string): string {
  const pricePair = text.match(/\b([A-Za-z][A-Za-z0-9.-]{1,15})\s+price\b/i);
  if (pricePair) return `${pricePair[1]} price`;
  const ticker = text.match(/\b([A-Z]{2,6})\b/);
  if (ticker) return `${ticker[1]} price`;
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 48 ? `${cleaned.slice(0, 45)}…` : cleaned || "Tracked topic";
}

function findRssInRecentAgentText(
  feed: readonly FeedItem[],
): { url: string; label: string } | undefined {
  for (let i = feed.length - 1; i >= 0; i--) {
    const item = feed[i];
    if (!item || item.kind !== "agent-text") continue;
    const urls = item.text.match(/https?:\/\/[^\s)\]"'<>]+/gi) ?? [];
    for (const raw of urls) {
      const url = raw.replace(/[.,;:]+$/g, "");
      if (!/^https:\/\//i.test(url)) continue;
      if (!/rss|atom|feed/i.test(url)) continue;
      let label = "Feed";
      try {
        label = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* keep default */
      }
      return { url, label };
    }
  }
  return undefined;
}

/**
 * When the agent soft-asked in text but never emitted settingsProposal, recover a
 * topic + watch (and optional RSS URL cited in agent text) from the owner's prior request.
 */
export function synthesizeSettingsProposalFromFeed(
  feed: readonly FeedItem[],
): PendingSettingsProposal | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const item = feed[i];
    if (!item || item.kind !== "user") continue;
    const text = item.text.trim();
    if (!text || text.startsWith("[")) continue;
    if (isSoftAssentMessage(text) || isSoftDeclineMessage(text)) continue;
    if (!TRACK_REQUEST_HINT.test(text)) continue;

    const topic = deriveTopicFromTrackRequest(text);
    const watchQuery = text.length > 180 ? `${text.slice(0, 177)}…` : text;
    const rss = findRssInRecentAgentText(feed);
    const proposal: PendingSettingsProposal = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      summary: `Keep me updated on ${topic}`,
      topic,
      watch: { query: watchQuery, everyMinutes: 60 },
    };
    if (rss) proposal.rss = rss;
    return proposal;
  }
  return null;
}
