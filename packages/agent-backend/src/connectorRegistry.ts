import type { ConnectorVault } from "./connectorVault.js";
import {
  BOOKMARKS_CONNECTOR_ID,
  BOOKMARKS_CONNECTOR_OPERATIONS,
  bookmarksConnectorOperation,
  invokeBookmarksConnector,
} from "./bookmarksConnector.js";
import {
  NEWS_SEARCH_CONNECTOR_ID,
  NEWS_SEARCH_CONNECTOR_OPERATIONS,
  invokeNewsSearchConnector,
  newsSearchConnectorOperation,
} from "./newsSearchConnector.js";
import {
  RSS_CONNECTOR_ID,
  RSS_CONNECTOR_OPERATIONS,
  invokeRssConnector,
  rssConnectorOperation,
} from "./rssConnector.js";
import {
  WEBCAL_CONNECTOR_ID,
  WEBCAL_CONNECTOR_OPERATIONS,
  connectorOperation,
  invokeWebcalConnector,
  type ConnectorOperationSpec,
} from "./webcalConnector.js";

/** Pluggable connector module (M9/M13.5 v1: WebCal + hero side doors). */
export interface ConnectorBackend {
  readonly id: string;
  readonly moduleId: string;
  readonly provider: string;
  readonly label: string;
  status(vault: ConnectorVault): Promise<Record<string, unknown>>;
  invoke(
    vault: ConnectorVault,
    operation: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  operationSpec?(operation: string): ConnectorOperationSpec | undefined;
}

const webcalBackend: ConnectorBackend = {
  id: WEBCAL_CONNECTOR_ID,
  moduleId: "connectors/webcal",
  provider: "webcal",
  label: "WebCal",
  async status(vault) {
    const feeds = vault.getWebcalFeeds();
    return {
      connectorId: WEBCAL_CONNECTOR_ID,
      moduleId: "connectors/webcal",
      provider: "webcal",
      label: "WebCal",
      configured: feeds.length > 0,
      feedCount: feeds.length,
      feeds: feeds.map((feed) => ({ id: feed.id, label: feed.label })),
      vaultOnly: true,
      operations: WEBCAL_CONNECTOR_OPERATIONS,
    };
  },
  async invoke(vault, operation, input) {
    return invokeWebcalConnector({ vault }, operation, input);
  },
  operationSpec(operation) {
    return connectorOperation(operation);
  },
};

const rssBackend: ConnectorBackend = {
  id: RSS_CONNECTOR_ID,
  moduleId: "connectors/rss",
  provider: "rss",
  label: "RSS",
  async status(vault) {
    const feeds = vault.getRssFeeds();
    return {
      connectorId: RSS_CONNECTOR_ID,
      moduleId: "connectors/rss",
      provider: "rss",
      label: "RSS",
      configured: feeds.length > 0,
      feedCount: feeds.length,
      feeds: feeds.map((feed) => ({ id: feed.id, label: feed.label })),
      vaultOnly: true,
      operations: RSS_CONNECTOR_OPERATIONS,
    };
  },
  async invoke(vault, operation, input) {
    return invokeRssConnector({ vault }, operation, input);
  },
  operationSpec(operation) {
    return rssConnectorOperation(operation);
  },
};

const bookmarksBackend: ConnectorBackend = {
  id: BOOKMARKS_CONNECTOR_ID,
  moduleId: "connectors/bookmarks",
  provider: "bookmarks",
  label: "Bookmarks",
  async status(vault) {
    const bookmarks = vault.getBookmarks();
    return {
      connectorId: BOOKMARKS_CONNECTOR_ID,
      moduleId: "connectors/bookmarks",
      provider: "bookmarks",
      label: "Bookmarks",
      configured: bookmarks.length > 0,
      bookmarkCount: bookmarks.length,
      bookmarks: bookmarks.map((item) => ({ id: item.id, label: item.label })),
      vaultOnly: true,
      operations: BOOKMARKS_CONNECTOR_OPERATIONS,
    };
  },
  async invoke(vault, operation, input) {
    return invokeBookmarksConnector({ vault }, operation, input);
  },
  operationSpec(operation) {
    return bookmarksConnectorOperation(operation);
  },
};

const newsSearchBackend: ConnectorBackend = {
  id: NEWS_SEARCH_CONNECTOR_ID,
  moduleId: "connectors/news-search",
  provider: "news-search",
  label: "News search",
  async status() {
    return {
      connectorId: NEWS_SEARCH_CONNECTOR_ID,
      moduleId: "connectors/news-search",
      provider: "news-search",
      label: "News search",
      configured: true,
      vaultOnly: false,
      operations: NEWS_SEARCH_CONNECTOR_OPERATIONS,
    };
  },
  async invoke(vault, operation, input) {
    return invokeNewsSearchConnector({ vault }, operation, input);
  },
  operationSpec(operation) {
    return newsSearchConnectorOperation(operation);
  },
};

/** Registered connector backends. Add Google Calendar, etc. here without changing route shapes. */
const CONNECTOR_BACKENDS = new Map<string, ConnectorBackend>([
  [WEBCAL_CONNECTOR_ID, webcalBackend],
  [RSS_CONNECTOR_ID, rssBackend],
  [BOOKMARKS_CONNECTOR_ID, bookmarksBackend],
  [NEWS_SEARCH_CONNECTOR_ID, newsSearchBackend],
]);

export function getConnectorBackend(connectorId: string): ConnectorBackend | undefined {
  return CONNECTOR_BACKENDS.get(connectorId.trim());
}

export function listConnectorBackendIds(): string[] {
  return [...CONNECTOR_BACKENDS.keys()];
}
