import { useMemo, useState, type ReactNode } from "react";
import { WebCalSettingsPanel } from "./WebCalSettingsPanel.js";
import { RssSettingsPanel } from "./RssSettingsPanel.js";
import { McpSettingsPanel } from "./McpSettingsPanel.js";
import { TokenConnectorsSettingsPanel } from "./TokenConnectorsSettingsPanel.js";
import { CalDavSettingsPanel } from "./CalDavSettingsPanel.js";
import { CardDavSettingsPanel } from "./CardDavSettingsPanel.js";
import { BookmarksSettingsPanel } from "./BookmarksSettingsPanel.js";

type ConnectorCategory = "calendar" | "contacts" | "news" | "apps" | "developer" | "web";

type ConnectorEntry = {
  id: string;
  label: string;
  hint: string;
  category: ConnectorCategory;
  keywords: string;
};

const CATEGORIES: { id: ConnectorCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "calendar", label: "Calendar" },
  { id: "contacts", label: "Contacts" },
  { id: "news", label: "News" },
  { id: "apps", label: "Apps" },
  { id: "web", label: "Web" },
  { id: "developer", label: "Developer" },
];

const CONNECTORS: ConnectorEntry[] = [
  {
    id: "webcal",
    label: "Calendar feed",
    hint: "Subscribe with a private calendar link (Google, Outlook, Apple).",
    category: "calendar",
    keywords: "webcal ics google outlook apple calendar feed",
  },
  {
    id: "caldav",
    label: "Calendar account",
    hint: "Sign in to a CalDAV calendar (Fastmail, Nextcloud, etc.).",
    category: "calendar",
    keywords: "caldav fastmail nextcloud calendar account",
  },
  {
    id: "carddav",
    label: "Contacts",
    hint: "Sign in to a CardDAV address book.",
    category: "contacts",
    keywords: "carddav contacts address book",
  },
  {
    id: "rss",
    label: "News feeds",
    hint: "Follow public RSS or Atom feeds.",
    category: "news",
    keywords: "rss atom news blog feed",
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    hint: "Save pages your agent can read when you ask.",
    category: "web",
    keywords: "bookmarks links pages url",
  },
  {
    id: "apps",
    label: "Connected apps",
    hint: "Todoist, GitHub, Notion, Linear, Trello, Home Assistant, Bluesky, Mastodon.",
    category: "apps",
    keywords:
      "todoist github notion linear trello home assistant bluesky mastodon token api",
  },
  {
    id: "mcp",
    label: "Extra tools (MCP)",
    hint: "Add tools that run on your agent or a remote server.",
    category: "developer",
    keywords: "mcp model context protocol tools stdio http",
  },
];

function categoryLabel(id: ConnectorCategory): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function ConnectorsCatalog({
  vaultUnlocked,
  onWebcalFeedsChanged,
  onRssFeedsChanged,
}: {
  vaultUnlocked: boolean;
  onWebcalFeedsChanged?: () => void | Promise<void>;
  onRssFeedsChanged?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ConnectorCategory | "all">("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONNECTORS.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!q) return true;
      const hay = `${entry.label} ${entry.hint} ${entry.keywords}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, category]);

  const active = activeId ? CONNECTORS.find((c) => c.id === activeId) : null;

  let detail: ReactNode = null;
  if (active) {
    switch (active.id) {
      case "webcal":
        detail = (
          <WebCalSettingsPanel
            vaultUnlocked={vaultUnlocked}
            embedded
            onFeedsChanged={onWebcalFeedsChanged}
          />
        );
        break;
      case "caldav":
        detail = <CalDavSettingsPanel vaultUnlocked={vaultUnlocked} embedded />;
        break;
      case "carddav":
        detail = <CardDavSettingsPanel vaultUnlocked={vaultUnlocked} embedded />;
        break;
      case "rss":
        detail = (
          <RssSettingsPanel
            vaultUnlocked={vaultUnlocked}
            embedded
            onFeedsChanged={onRssFeedsChanged}
          />
        );
        break;
      case "bookmarks":
        detail = <BookmarksSettingsPanel vaultUnlocked={vaultUnlocked} embedded />;
        break;
      case "apps":
        detail = <TokenConnectorsSettingsPanel vaultUnlocked={vaultUnlocked} embedded />;
        break;
      case "mcp":
        detail = <McpSettingsPanel vaultUnlocked={vaultUnlocked} embedded />;
        break;
      default:
        detail = null;
    }
  }

  if (active) {
    return (
      <div className="connectors-catalog connectors-catalog--detail">
        <button
          type="button"
          className="connectors-catalog-back"
          onClick={() => setActiveId(null)}
        >
          ← All connectors
        </button>
        <header className="connectors-catalog-detail-head">
          <h3>{active.label}</h3>
          <p>{active.hint}</p>
        </header>
        <div className="connectors-catalog-detail-body">{detail}</div>
      </div>
    );
  }

  return (
    <div className="connectors-catalog">
      <p className="settings-note">
        Connect calendars, news, and apps. Details stay on your agent — not in this browser.
      </p>
      <label className="atom-field connectors-catalog-search">
        <span className="atom-field-label">Search connectors</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Calendar, GitHub, RSS…"
          autoComplete="off"
        />
      </label>
      <div className="connectors-catalog-filters" role="tablist" aria-label="Connector categories">
        {CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={category === item.id}
            className={
              category === item.id
                ? "connectors-catalog-filter is-active"
                : "connectors-catalog-filter"
            }
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="panel-empty">No connectors match that search.</p>
      ) : (
        <ul className="connectors-catalog-list">
          {filtered.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="connectors-catalog-item"
                onClick={() => setActiveId(entry.id)}
              >
                <span className="connectors-catalog-item-label">{entry.label}</span>
                <span className="connectors-catalog-item-meta">{categoryLabel(entry.category)}</span>
                <span className="connectors-catalog-item-hint">{entry.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
