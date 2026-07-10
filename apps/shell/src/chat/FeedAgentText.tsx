import { calendarAddUrlFromAction } from "../calendarAddLink.js";
import type { ConsequentialAction } from "@qwixl/shell-core";
import type { LinkIntentPayload } from "./linkIntent.js";
import { renderRichTextWithLinks } from "./renderRichText.js";

function brainBadgeLabel(brainKind?: "daily-briefing" | "reminder" | "watch"): string {
  switch (brainKind) {
    case "daily-briefing":
      return "Briefing";
    case "reminder":
      return "Reminder";
    case "watch":
      return "Watch";
    default:
      return "Brain";
  }
}

export function FeedAgentText({
  text,
  calendarAction,
  onLinkIntent,
  origin,
  brainKind,
}: {
  text: string;
  calendarAction?: ConsequentialAction | null;
  onLinkIntent?: (payload: LinkIntentPayload) => void;
  origin?: "brain";
  brainKind?: "daily-briefing" | "reminder" | "watch";
}) {
  const calendarUrl = calendarAction ? calendarAddUrlFromAction(calendarAction) : null;

  return (
    <div className={`feed-agent${origin === "brain" ? " feed-agent--brain" : ""}`}>
      {origin === "brain" ? (
        <span className="feed-agent-origin">{brainBadgeLabel(brainKind)}</span>
      ) : null}
      <div className="feed-agent-text">{renderRichTextWithLinks(text, onLinkIntent)}</div>
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
