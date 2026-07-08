import { validateHttpsUrl } from "@qwixl/shell-core";

/** F7-1: owner intent when activating a content link in chat. */
export type LinkIntentKind = "summarize" | "full" | "explore";

export interface LinkIntentPayload {
  url: string;
  title: string;
  intent: LinkIntentKind;
  /** F7-2: active discovery path metadata (shell-owned). */
  pathId?: string;
  stepId?: string;
  stepIndex?: number;
}

export const LINK_INTENT_PREFIX = "[link-intent]";

export const LINK_INTENT_LABELS: Record<LinkIntentKind, string> = {
  summarize: "Summarise",
  full: "In-Full",
  explore: "Explore",
};

export function buildLinkIntentMessage(payload: LinkIntentPayload): string {
  const url = validateHttpsUrl(payload.url);
  if (!url) throw new Error("Link must be a public https URL");
  const title = payload.title.trim() || url;
  return `${LINK_INTENT_PREFIX} ${JSON.stringify({
    url,
    title,
    intent: payload.intent,
    ...(payload.pathId ? { pathId: payload.pathId } : {}),
    ...(payload.stepId ? { stepId: payload.stepId } : {}),
    ...(typeof payload.stepIndex === "number" ? { stepIndex: payload.stepIndex } : {}),
  })}`;
}

export function friendlyLinkIntentLabel(payload: LinkIntentPayload): string {
  const title = payload.title.trim() || payload.url;
  return `${LINK_INTENT_LABELS[payload.intent]}: ${title}`;
}

export function isLinkIntentProtocolMessage(text: string): boolean {
  return text.trimStart().toLowerCase().startsWith(LINK_INTENT_PREFIX.toLowerCase());
}

/** Calendar and other shell-owned outbound links bypass the content link menu. */
export function isShellOutboundLink(href: string): boolean {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return host === "calendar.google.com";
  } catch {
    return false;
  }
}

export function isContentHttpsLink(href: string): boolean {
  if (isShellOutboundLink(href)) return false;
  return validateHttpsUrl(href) !== null;
}
