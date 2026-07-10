import { useCallback, useEffect, useRef, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

interface RssFeedSummary {
  id: string;
  label: string;
}

function validateRssFeedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a feed URL.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("That does not look like a valid URL. Example: https://feeds.bbci.co.uk/news/rss.xml");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Feed URL must start with https:// (or http://).");
  }
  // Prefer HTTPS when the user pasted a legacy http:// BBC-style link.
  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }
  return parsed.toString();
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

  const onFeedsChangedRef = useRef(onFeedsChanged);
  onFeedsChangedRef.current = onFeedsChanged;

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const statusOp = await client.invokeConnector("rss", "getStatus", {});
      const statusResult = statusOp.result as { feeds?: RssFeedSummary[] };
      setFeeds(statusResult.feeds ?? []);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      onFeedsChangedRef.current?.();
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveFeed() {
    let url: string;
    try {
      url = validateRssFeedUrl(feedUrl);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      return;
    }
    setBusy(true);
    setNote("Saving RSS feed to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Add RSS feed", { url }, config);
      await client.addRssFeed(url, feedLabel.trim() || undefined, approvalRef);
      setFeedUrl("");
      setFeedLabel("");
      await refresh();
      setNote("Feed saved.");
      window.setTimeout(() => setNote(null), 2500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNote(
        message.includes("Passkey") || message.includes("approval") || message.includes("Custody")
          ? message
          : `Could not save feed: ${message}`,
      );
    } finally {
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
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <>
      {!embedded ? (
        <>
          <h3>News feeds</h3>
          <p className="settings-note">Follow public news or blog feeds. Links are saved on your agent.</p>
        </>
      ) : null}
      {!config.adminToken ? (
        <p className="settings-note webcal-settings-warn">Connect your agent first to save feeds.</p>
      ) : null}
      <div className="connector-form-grid">
        <label className="atom-field">
          <span className="atom-field-label">Feed link</span>
          <input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://feeds.bbci.co.uk/news/rss.xml"
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Name (optional)</span>
          <input
            value={feedLabel}
            onChange={(e) => setFeedLabel(e.target.value)}
            placeholder="Tech news"
            autoComplete="off"
            disabled={busy}
          />
        </label>
      </div>
      <div className="chrome-actions settings-section-actions">
        <button type="button" className="chrome-approve" disabled={busy || !feedUrl.trim()} onClick={() => void saveFeed()}>
          Save feed
        </button>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh list
        </button>
      </div>
      {feeds.length > 0 ? (
        <div className="webcal-feeds">
          <h4>Your feeds</h4>
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
      ) : (
        <p className="settings-note">No feeds saved yet.</p>
      )}
      {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
    </>
  );

  if (embedded) {
    return <div className="settings-panel-fields connector-settings">{body}</div>;
  }
  return <section className="settings-section connector-settings">{body}</section>;
}
