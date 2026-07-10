/** Soft-confirm settings proposals from chat (track topic / RSS / watch). */

import type { ConsequentialAction, JsonObject } from "@qwixl/shell-core";

const STORAGE_KEY = "atom.settings.pendingProposal";
const MAX_AGE_MS = 30 * 60 * 1000;

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
