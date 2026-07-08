import type { ReactNode } from "react";
import { calendarAddUrlFromAction } from "../calendarAddLink.js";
import type { ConsequentialAction } from "@qwixl/shell-core";

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
const RAW_URL = /(https:\/\/calendar\.google\.com\/[^\s)]+)/g;

function renderTextWithLinks(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const combined = new RegExp(`${MARKDOWN_LINK.source}|${RAW_URL.source}`, "g");
  let match: RegExpExecArray | null;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      nodes.push(
        <a key={`${match.index}-md`} href={match[2]} target="_blank" rel="noopener noreferrer">
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      nodes.push(
        <a key={`${match.index}-raw`} href={match[3]} target="_blank" rel="noopener noreferrer">
          Add to Google Calendar
        </a>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? nodes : [text];
}

export function FeedAgentText({
  text,
  calendarAction,
}: {
  text: string;
  calendarAction?: ConsequentialAction | null;
}) {
  const calendarUrl = calendarAction ? calendarAddUrlFromAction(calendarAction) : null;

  return (
    <div className="feed-agent">
      <div className="feed-agent-text">{renderTextWithLinks(text)}</div>
      {calendarUrl ? (
        <p className="feed-calendar-add">
          <a className="feed-calendar-add-link" href={calendarUrl} target="_blank" rel="noopener noreferrer">
            Add to Google Calendar
          </a>
        </p>
      ) : null}
    </div>
  );
}
