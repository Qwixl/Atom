/**
 * Soft-confirm offer-turn repair (composition-loop fix for settings-missing).
 * When the owner asks to track/alert/brief and the model replies without
 * settingsProposal, inject one correction turn before emitting to the shell.
 */
export const SOFT_CONFIRM_REPAIR_TAG = "[soft-confirm-repair]";

const SETTINGS_ASSENT = /\[settings-assent/i;

/** Strong single-phrase soft-confirm asks. */
const STRONG_OFFER =
  /\b(keep me updated|daily update|alert (me|if|when)|standing watch|briefing topic)\b/i;

/** Weaker verbs that need a second signal. */
const WEAK_VERB = /\b(track|follow|subscribe|watch|briefing|fluctuat)\b/i;
const TOPICISH = /\b(price|stock|crypto|ticker|topic|news|feed|rss|alert|daily|update)\b/i;

/**
 * True when this owner message should produce a settingsProposal in the same turn.
 * Conservative: avoid "what's the price?" false positives.
 */
export function ownerMessageNeedsSettingsProposal(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  if (SETTINGS_ASSENT.test(text)) return true;
  if (text.includes(SOFT_CONFIRM_REPAIR_TAG)) return true;
  if (STRONG_OFFER.test(text)) return true;
  if (WEAK_VERB.test(text) && TOPICISH.test(text)) return true;
  // Two distinct soft-confirm signals (e.g. "daily" + "alert")
  const signals = [
    /\btrack\b/i,
    /\balert\b/i,
    /\bwatch\b/i,
    /\bdaily\b/i,
    /\bfollow\b/i,
    /\bsubscribe\b/i,
    /\bbriefing\b/i,
    /\bfluctuat/i,
    /\bkeep me updated\b/i,
  ];
  return signals.filter((r) => r.test(text)).length >= 2;
}

export function protocolHasSettingsProposal(raw: string): boolean {
  return /settingsProposal["']?\s*:\s*(true|"true")/i.test(raw);
}

export function protocolMessagesHaveSettingsProposal(messages: unknown[]): boolean {
  return protocolHasSettingsProposal(JSON.stringify(messages));
}

/** One-shot user correction injected into the LLM history (not shown as owner chat). */
export function softConfirmRepairUserContent(): string {
  return (
    `${SOFT_CONFIRM_REPAIR_TAG} Your previous reply offered to track/update/alert but omitted the ` +
    `required consequential-action. Respond again for that same turn with ONLY the JSON object: ` +
    `include a short text soft-confirm AND one consequential-action with kind "permission" and terms ` +
    `settingsProposal:true plus summary, topic, and watchQuery (everyMinutes optional). ` +
    `Do not emit briefing-daily. Example terms: ` +
    `{"settingsProposal":true,"summary":"Keep me updated","topic":"XRP price",` +
    `"watchQuery":"XRP price move of about 5% or more over a week","everyMinutes":60}`
  );
}

/** Skip format-error / repair tags when finding the triggering owner ask. */
export function isInternalProtocolUserMessage(content: string): boolean {
  return (
    content.startsWith("[format-error]") ||
    content.startsWith(SOFT_CONFIRM_REPAIR_TAG) ||
    content.startsWith("[settings-assent-retry]")
  );
}
