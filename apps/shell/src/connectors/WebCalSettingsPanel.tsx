import { useCallback, useEffect, useState } from "react";
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
}: {
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { config, client } = useAgentConfig(vaultUnlocked);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedLabel, setFeedLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<WebcalFeedSummary[]>([]);
  const [events, setEvents] = useState<CalendarEventSummary[]>([]);
  const connected = feeds.length > 0;

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
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
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveFeed() {
    const url = feedUrl.trim();
    if (!url) return;
    setBusy(true);
    setNote("Saving feed URL to your agent vault…");
    try {
      await client.addWebcalFeed(url, feedLabel.trim() || undefined);
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
      await client.removeWebcalFeed(feedId);
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
