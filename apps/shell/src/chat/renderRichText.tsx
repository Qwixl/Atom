import type { ReactNode } from "react";
import { validateHttpsUrl } from "@qwixl/shell-core";
import { AtomContentLink } from "./AtomContentLink.js";
import {
  isContentHttpsLink,
  isShellOutboundLink,
  type LinkIntentPayload,
} from "./linkIntent.js";

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
const RAW_CALENDAR_URL = /(https:\/\/calendar\.google\.com\/[^\s)]+)/g;
const RAW_HTTPS_URL = /(https:\/\/(?!calendar\.google\.com)[^\s)<>"']+)/g;

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

function safeHttpsHref(href: string): string | null {
  return validateHttpsUrl(trimTrailingUrlPunctuation(href));
}

/** Render plain text with markdown links and optional Atom link tool menu (F7-1). */
export function renderRichTextWithLinks(
  text: string,
  onLinkIntent?: (payload: LinkIntentPayload) => void,
): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const combined = new RegExp(
    `${MARKDOWN_LINK.source}|${RAW_CALENDAR_URL.source}|${RAW_HTTPS_URL.source}`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      const label = match[1];
      const href = safeHttpsHref(match[2]);
      if (!href) {
        nodes.push(label);
      } else if (onLinkIntent && isContentHttpsLink(href)) {
        nodes.push(
          <AtomContentLink key={`${match.index}-md`} href={href} onIntent={onLinkIntent}>
            {label}
          </AtomContentLink>,
        );
      } else {
        nodes.push(
          <a
            key={`${match.index}-md`}
            href={href}
            target={isShellOutboundLink(href) ? "_blank" : undefined}
            rel={isShellOutboundLink(href) ? "noopener noreferrer" : undefined}
          >
            {label}
          </a>,
        );
      }
    } else if (match[3]) {
      const calHref = safeHttpsHref(match[3]);
      if (calHref) {
        nodes.push(
          <a key={`${match.index}-cal`} href={calHref} target="_blank" rel="noopener noreferrer">
            Add to Google Calendar
          </a>,
        );
      } else {
        nodes.push(match[3]);
      }
    } else if (match[4]) {
      const href = safeHttpsHref(match[4]);
      if (!href) {
        nodes.push(trimTrailingUrlPunctuation(match[4]));
      } else if (onLinkIntent && isContentHttpsLink(href)) {
        nodes.push(
          <AtomContentLink key={`${match.index}-raw`} href={href} onIntent={onLinkIntent}>
            {href}
          </AtomContentLink>,
        );
      } else {
        nodes.push(
          <a key={`${match.index}-raw`} href={href} target="_blank" rel="noopener noreferrer">
            {href}
          </a>,
        );
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? nodes : text;
}
