import { useCallback, useEffect, useRef, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

interface WebcalFeedSummary {
  id: string;
  label: string;
}

interface CalendarEventSummary {
  uid: string;
  summary: string;
  start: string;
  end: string;
}

interface CalendarPublishFeed {
  eventCount: number;
  feedUrl: string;
  webcalUrl: string;
  tokenHint: string;
}

function formatRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return `${s.toLocaleString(undefined, opts)} – ${e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export function WebCalSettingsPanel({
  vaultUnlocked = true,
  embedded = false,
  onFeedsChanged,
}: {
  vaultUnlocked?: boolean;
  embedded?: boolean;
  onFeedsChanged?: () => void;
}) {
  const { config, client } = useAgentConfig(vaultUnlocked);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedLabel, setFeedLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<WebcalFeedSummary[]>([]);
  const [events, setEvents] = useState<CalendarEventSummary[]>([]);
  const [publishFeed, setPublishFeed] = useState<CalendarPublishFeed | null>(null);
  const connected = feeds.length > 0;

  const refreshPublishFeed = useCallback(async () => {
    if (!config.adminToken) {
      setPublishFeed(null);
      return;
    }
    try {
      const status = await client.getCalendarPublishFeed();
      setPublishFeed(status);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  }, [client, config.adminToken]);

  const onFeedsChangedRef = useRef(onFeedsChanged);
  onFeedsChangedRef.current = onFeedsChanged;

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      await refreshPublishFeed();
      const statusOp = await client.invokeConnector("webcal", "getStatus", {});
      const statusResult = statusOp.result as {
        feeds?: WebcalFeedSummary[];
      };
      const nextFeeds = statusResult.feeds ?? [];
      setFeeds(nextFeeds);
      if (nextFeeds.length === 0) {
        setEvents([]);
        return;
      }
      const now = new Date();
      const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const listed = await client.invokeConnector("webcal", "listEvents", {
        timeMin: now.toISOString(),
        timeMax: week.toISOString(),
      });
      setEvents((listed.result as { events?: CalendarEventSummary[] }).events ?? []);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      onFeedsChangedRef.current?.();
    }
  }, [client, refreshPublishFeed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNote(`${label} copied.`);
    } catch {
      setNote(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function rotatePublishToken() {
    setBusy(true);
    setNote("Rotating publish feed token…");
    try {
      const status = await client.rotateCalendarPublishFeedToken();
      setPublishFeed(status);
      setNote("Publish feed token rotated. Update subscriptions in your calendar app.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function syncPublishFeed() {
    setBusy(true);
    setNote("Syncing accepted meetings from inbox…");
    try {
      const result = await client.syncCalendarPublishFeed();
      await refreshPublishFeed();
      setNote(
        result.added > 0
          ? `Added ${result.added} accepted meeting${result.added === 1 ? "" : "s"} to publish feed.`
          : "Publish feed is up to date.",
      );
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveFeed() {
    const url = feedUrl.trim();
    if (!url) return;
    setBusy(true);
    setNote("Saving feed URL to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Add WebCal feed", { url }, config);
      await client.addWebcalFeed(url, feedLabel.trim() || undefined, approvalRef);
      setFeedUrl("");
      setFeedLabel("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeFeed(feedId: string) {
    setBusy(true);
    setNote("Removing feed…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Remove WebCal feed", { feedId });
      await client.removeWebcalFeed(feedId, approvalRef);
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  const body = (
    <>
      {!embedded ? (
        <>
          <h3>Calendar feed</h3>
          <p className="settings-note">
            Paste a private calendar link from Google, Apple, or Outlook. It is saved on your agent.
          </p>
        </>
      ) : null}
      {!config.adminToken ? (
        <p className="settings-note webcal-settings-warn">
          Connect your agent first to save calendar feeds.
        </p>
      ) : null}
      {config.adminToken ? (
        <div className="webcal-publish-feed">
          <h4>Share accepted meetings</h4>
          <p className="settings-note">
            Use this link in Google, Apple, or Outlook to see meetings you accept in Atom.
          </p>
          {publishFeed ? (
            <>
              <p className="settings-note">
                {publishFeed.eventCount} accepted meeting{publishFeed.eventCount === 1 ? "" : "s"}
              </p>
              <label className="atom-field">
                <span className="atom-field-label">Subscribe link</span>
                <input value={publishFeed.webcalUrl} readOnly disabled={busy} />
              </label>
              <div className="chrome-actions settings-section-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void copyText("Subscribe URL", publishFeed.webcalUrl)}
                >
                  Copy link
                </button>
                <button type="button" disabled={busy} onClick={() => void syncPublishFeed()}>
                  Refresh
                </button>
                <button type="button" disabled={busy} onClick={() => void rotatePublishToken()}>
                  New link
                </button>
              </div>
            </>
          ) : (
            <p className="settings-note">Loading share link…</p>
          )}
        </div>
      ) : null}
      <div className="connector-form-grid">
        <label className="atom-field">
          <span className="atom-field-label">Calendar link</span>
          <input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="webcal://… or https://…/basic.ics"
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Name (optional)</span>
          <input
            value={feedLabel}
            onChange={(e) => setFeedLabel(e.target.value)}
            placeholder="Work calendar"
            autoComplete="off"
            disabled={busy}
          />
        </label>
      </div>
      <div className="chrome-actions settings-section-actions">
        <button type="button" className="chrome-approve" disabled={busy || !feedUrl.trim()} onClick={() => void saveFeed()}>
          Save calendar
        </button>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {feeds.length > 0 ? (
        <div className="webcal-feeds">
          <h4>Your calendars</h4>
          <ul>
            {feeds.map((feed) => (
              <li key={feed.id}>
                <span>{feed.label}</span>
                <button type="button" className="webcal-remove" disabled={busy} onClick={() => void removeFeed(feed.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {connected ? (
        <div className="webcal-events">
          <h4>Coming up (7 days)</h4>
          {events.length === 0 ? (
            <p className="settings-note">No events in range.</p>
          ) : (
            <ul>
              {events.map((event) => (
                <li key={event.uid}>
                  <div className="webcal-event-title">{event.summary}</div>
                  <div className="webcal-event-time">{formatRange(event.start, event.end)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
    </>
  );

  if (embedded) {
    return <div className="settings-panel-fields webcal-settings">{body}</div>;
  }

  return <section className="settings-section webcal-settings">{body}</section>;
}
