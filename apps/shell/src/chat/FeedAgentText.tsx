import { calendarAddUrlFromAction } from "../calendarAddLink.js";
import type { ConsequentialAction } from "@qwixl/shell-core";
import type { LinkIntentPayload } from "./linkIntent.js";
import { renderRichTextWithLinks } from "./renderRichText.js";

export function FeedAgentText({
  text,
  calendarAction,
  onLinkIntent,
}: {
  text: string;
  calendarAction?: ConsequentialAction | null;
  onLinkIntent?: (payload: LinkIntentPayload) => void;
}) {
  const calendarUrl = calendarAction ? calendarAddUrlFromAction(calendarAction) : null;

  return (
    <div className="feed-agent">
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
