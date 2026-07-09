import { useCallback, useEffect, useState } from "react";
import { approvalRefForConnectorWrite } from "./connectorWriteApproval.js";
import { useAgentConfig } from "../comms/useAgentConfig.js";

interface BookmarkSummary {
  id: string;
  label: string;
}

export function BookmarksSettingsPanel({
  vaultUnlocked = true,
  embedded = false,
}: {
  vaultUnlocked?: boolean;
  embedded?: boolean;
}) {
  const { config, client } = useAgentConfig(vaultUnlocked);
  const [pageUrl, setPageUrl] = useState("");
  const [pageLabel, setPageLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkSummary[]>([]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const statusOp = await client.invokeConnector("bookmarks", "getStatus", {});
      const statusResult = statusOp.result as { bookmarks?: BookmarkSummary[] };
      setBookmarks(statusResult.bookmarks ?? []);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveBookmark() {
    const url = pageUrl.trim();
    if (!url) return;
    setBusy(true);
    setNote("Saving bookmark to your agent vault…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Save bookmark", { url }, config);
      await client.addBookmark(url, pageLabel.trim() || undefined, approvalRef);
      setPageUrl("");
      setPageLabel("");
      setNote(null);
      await refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function removeBookmark(bookmarkId: string) {
    setBusy(true);
    setNote("Removing bookmark…");
    try {
      const approvalRef = await approvalRefForConnectorWrite("Remove bookmark", { bookmarkId });
      await client.removeBookmark(bookmarkId, approvalRef);
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
          <h3>Bookmarks</h3>
          <p className="settings-note">Save pages your agent can read when you ask.</p>
        </>
      ) : null}
      {!config.adminToken ? (
        <p className="settings-note webcal-settings-warn">Connect your agent first to save bookmarks.</p>
      ) : null}
      <div className="connector-form-grid">
        <label className="atom-field">
          <span className="atom-field-label">Page link</span>
          <input
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
            placeholder="https://…"
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Name (optional)</span>
          <input
            value={pageLabel}
            onChange={(e) => setPageLabel(e.target.value)}
            placeholder="Product docs"
            autoComplete="off"
            disabled={busy}
          />
        </label>
      </div>
      <div className="chrome-actions settings-section-actions">
        <button
          type="button"
          className="chrome-approve"
          disabled={busy || !pageUrl.trim()}
          onClick={() => void saveBookmark()}
        >
          Save bookmark
        </button>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {bookmarks.length > 0 ? (
        <div className="webcal-feeds">
          <h4>Saved bookmarks</h4>
          <ul>
            {bookmarks.map((item) => (
              <li key={item.id}>
                <span>{item.label}</span>
                <button
                  type="button"
                  className="webcal-remove"
                  disabled={busy}
                  onClick={() => void removeBookmark(item.id)}
                >
                  Remove
                </button>
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
