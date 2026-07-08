import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

interface RssFeedSummary {
  id: string;
  label: string;
}

interface RssItemSummary {
  id: string;
  title: string;
  link?: string;
  published?: string;
}

export function RssSettingsPanel({
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
  const [feeds, setFeeds] = useState<RssFeedSummary[]>([]);
  const [items, setItems] = useState<RssItemSummary[]>([]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const statusOp = await client.invokeConnector("rss", "getStatus", {});
      const statusResult = statusOp.result as { feeds?: RssFeedSummary[] };
      const nextFeeds = statusResult.feeds ?? [];
      setFeeds(nextFeeds);
      if (nextFeeds.length === 0) {
        setItems([]);
        return;
      }
      const listed = await client.invokeConnector("rss", "listItems", { limit: 8 });
      setItems((listed.result as { items?: RssItemSummary[] }).items ?? []);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      onFeedsChanged?.();
    }
  }, [client, onFeedsChanged]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveFeed() {
    const url = feedUrl.trim();
    if (!url) return;
    setBusy(true);
    setNote("Saving RSS feed to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Add RSS feed", { url }, config);
      await client.addRssFeed(url, feedLabel.trim() || undefined, approvalRef);
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
      const approvalRef = await approvalRefForConnectorWrite("Remove RSS feed", { feedId });
      await client.removeRssFeed(feedId, approvalRef);
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
          <h3>RSS / Atom</h3>
          <p className="settings-note">
            Subscribe to public news or blog feeds without OAuth. URLs are stored encrypted on your agent.
          </p>
        </>
      ) : (
        <h4>RSS / Atom</h4>
      )}
      {!config.adminToken ? (
        <p className="settings-note webcal-settings-warn">Connect your agent first to save RSS feeds.</p>
      ) : null}
      <label className="atom-field">
        <span className="atom-field-label">Feed URL (https://)</span>
        <input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          placeholder="https://…/feed.xml"
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <label className="atom-field">
        <span className="atom-field-label">Label (optional)</span>
        <input
          value={feedLabel}
          onChange={(e) => setFeedLabel(e.target.value)}
          placeholder="Tech news"
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
      {items.length > 0 ? (
        <div className="webcal-events">
          <h4>Recent items</h4>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <div className="webcal-event-title">{item.title}</div>
                {item.published ? <div className="webcal-event-time">{item.published}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
    </>
  );

  if (embedded) {
    return <div className="settings-panel-fields connector-settings">{body}</div>;
  }
  return <section className="settings-section connector-settings">{body}</section>;
}
