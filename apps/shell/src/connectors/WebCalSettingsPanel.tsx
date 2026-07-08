import { useCallback, useEffect, useState } from "react";
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
      onFeedsChanged?.();
    }
  }, [client, refreshPublishFeed, onFeedsChanged]);

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
          <h3>WebCal</h3>
          <p className="settings-note">
            Paste your private calendar subscription link (from Google, Apple, or Outlook). It is stored
            encrypted on your agent — not in this browser.
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
          <h4>Publish accepted meetings</h4>
          <p className="settings-note">
            Subscribe in Google Calendar, Apple Calendar, or Outlook using the webcal link below.
            Only meetings you accept in Atom appear in this feed.
          </p>
          {publishFeed ? (
            <>
              <p className="settings-note">
                {publishFeed.eventCount} accepted meeting{publishFeed.eventCount === 1 ? "" : "s"} · token{" "}
                {publishFeed.tokenHint}
              </p>
              <label className="atom-field">
                <span className="atom-field-label">Subscribe URL (webcal)</span>
                <input value={publishFeed.webcalUrl} readOnly disabled={busy} />
              </label>
              <div className="chrome-actions settings-section-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void copyText("Subscribe URL", publishFeed.webcalUrl)}
                >
                  Copy webcal URL
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void copyText("HTTPS feed URL", publishFeed.feedUrl)}
                >
                  Copy https URL
                </button>
                <button type="button" disabled={busy} onClick={() => void syncPublishFeed()}>
                  Sync from inbox
                </button>
                <button type="button" disabled={busy} onClick={() => void rotatePublishToken()}>
                  Rotate token
                </button>
              </div>
            </>
          ) : (
            <p className="settings-note">Loading publish feed…</p>
          )}
        </div>
      ) : null}
      <label className="atom-field">
        <span className="atom-field-label">Feed URL (https:// or webcal://)</span>
        <input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="webcal://… or https://…/basic.ics"
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <label className="atom-field">
        <span className="atom-field-label">Label (optional)</span>
        <input
          value={feedLabel}
          onChange={(e) => setFeedLabel(e.target.value)}
          placeholder="Work calendar"
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <div className="chrome-actions settings-section-actions">
        <button type="button" className="chrome-approve" disabled={busy || !feedUrl.trim()} onClick={() => void saveFeed()}>
          Save feed to agent
        </button>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {feeds.length > 0 ? (
        <div className="webcal-feeds">
          <h4>Connected feeds</h4>
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
          <h4>Upcoming events (next 7 days)</h4>
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
