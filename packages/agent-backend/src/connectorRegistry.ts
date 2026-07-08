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
  GITHUB_CONNECTOR_ID,
  GITHUB_CONNECTOR_OPERATIONS,
  githubConnectorOperation,
  invokeGithubConnector,
} from "./githubConnector.js";
import {
  NOTION_CONNECTOR_ID,
  NOTION_CONNECTOR_OPERATIONS,
  invokeNotionConnector,
  notionConnectorOperation,
} from "./notionConnector.js";
import {
  TODOIST_CONNECTOR_ID,
  TODOIST_CONNECTOR_OPERATIONS,
  invokeTodoistConnector,
  todoistConnectorOperation,
} from "./todoistConnector.js";
import {
  LINEAR_CONNECTOR_ID,
  LINEAR_CONNECTOR_OPERATIONS,
  invokeLinearConnector,
  linearConnectorOperation,
} from "./linearConnector.js";
import {
  TRELLO_CONNECTOR_ID,
  TRELLO_CONNECTOR_OPERATIONS,
  invokeTrelloConnector,
  trelloConnectorOperation,
} from "./trelloConnector.js";
import {
  HOME_ASSISTANT_CONNECTOR_ID,
  HOME_ASSISTANT_CONNECTOR_OPERATIONS,
  invokeHomeAssistantConnector,
  homeAssistantConnectorOperation,
} from "./homeAssistantConnector.js";
import {
  CALDAV_CONNECTOR_ID,
  CALDAV_CONNECTOR_OPERATIONS,
  caldavConnectorOperation,
  invokeCalDavConnector,
} from "./caldavConnector.js";
import {
  CARDDAV_CONNECTOR_ID,
  CARDDAV_CONNECTOR_OPERATIONS,
  carddavConnectorOperation,
  invokeCardDavConnector,
} from "./carddavConnector.js";
import {
  WEATHER_CONNECTOR_ID,
  WEATHER_CONNECTOR_OPERATIONS,
  invokeWeatherConnector,
  weatherConnectorOperation,
} from "./weatherConnector.js";
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

function tokenConnectorBackend(
  id: string,
  label: string,
  operations: ConnectorOperationSpec[],
  invoke: typeof invokeTodoistConnector,
  operationLookup: (operation: string) => ConnectorOperationSpec | undefined,
): ConnectorBackend {
  return {
    id,
    moduleId: `connectors/${id}`,
    provider: id,
    label,
    async status(vault) {
      const stored = vault.getApiToken(id);
      return {
        connectorId: id,
        moduleId: `connectors/${id}`,
        provider: id,
        label,
        configured: Boolean(stored?.token),
        configuredAt: stored?.configuredAt,
        vaultOnly: true,
        operations,
      };
    },
    async invoke(vault, operation, input) {
      return invoke({ vault }, operation, input);
    },
    operationSpec(operation) {
      return operationLookup(operation);
    },
  };
}

/** Registered connector backends. Add Google Calendar, etc. here without changing route shapes. */
const CONNECTOR_BACKENDS = new Map<string, ConnectorBackend>([
  [WEBCAL_CONNECTOR_ID, webcalBackend],
  [RSS_CONNECTOR_ID, rssBackend],
  [BOOKMARKS_CONNECTOR_ID, bookmarksBackend],
  [NEWS_SEARCH_CONNECTOR_ID, newsSearchBackend],
  [
    TODOIST_CONNECTOR_ID,
    tokenConnectorBackend(
      TODOIST_CONNECTOR_ID,
      "Todoist",
      TODOIST_CONNECTOR_OPERATIONS,
      invokeTodoistConnector,
      todoistConnectorOperation,
    ),
  ],
  [
    GITHUB_CONNECTOR_ID,
    tokenConnectorBackend(
      GITHUB_CONNECTOR_ID,
      "GitHub",
      GITHUB_CONNECTOR_OPERATIONS,
      invokeGithubConnector,
      githubConnectorOperation,
    ),
  ],
  [
    NOTION_CONNECTOR_ID,
    tokenConnectorBackend(
      NOTION_CONNECTOR_ID,
      "Notion",
      NOTION_CONNECTOR_OPERATIONS,
      invokeNotionConnector,
      notionConnectorOperation,
    ),
  ],
  [
    LINEAR_CONNECTOR_ID,
    tokenConnectorBackend(
      LINEAR_CONNECTOR_ID,
      "Linear",
      LINEAR_CONNECTOR_OPERATIONS,
      invokeLinearConnector,
      linearConnectorOperation,
    ),
  ],
  [
    TRELLO_CONNECTOR_ID,
    {
      id: TRELLO_CONNECTOR_ID,
      moduleId: "connectors/trello",
      provider: "trello",
      label: "Trello",
      async status(vault) {
        const stored = vault.getTrelloCredentials();
        return {
          connectorId: TRELLO_CONNECTOR_ID,
          moduleId: "connectors/trello",
          provider: "trello",
          label: "Trello",
          configured: Boolean(stored?.apiKey && stored.token),
          configuredAt: stored?.configuredAt,
          vaultOnly: true,
          operations: TRELLO_CONNECTOR_OPERATIONS,
        };
      },
      async invoke(vault, operation, input) {
        return invokeTrelloConnector({ vault }, operation, input);
      },
      operationSpec(operation) {
        return trelloConnectorOperation(operation);
      },
    },
  ],
  [
    HOME_ASSISTANT_CONNECTOR_ID,
    {
      id: HOME_ASSISTANT_CONNECTOR_ID,
      moduleId: "connectors/home-assistant",
      provider: "home-assistant",
      label: "Home Assistant",
      async status(vault) {
        const stored = vault.getHomeAssistantInstance();
        return {
          connectorId: HOME_ASSISTANT_CONNECTOR_ID,
          moduleId: "connectors/home-assistant",
          provider: "home-assistant",
          label: "Home Assistant",
          configured: Boolean(stored?.baseUrl && stored.accessToken),
          configuredAt: stored?.configuredAt,
          vaultOnly: true,
          operations: HOME_ASSISTANT_CONNECTOR_OPERATIONS,
        };
      },
      async invoke(vault, operation, input) {
        return invokeHomeAssistantConnector({ vault }, operation, input);
      },
      operationSpec(operation) {
        return homeAssistantConnectorOperation(operation);
      },
    },
  ],
  [
    CALDAV_CONNECTOR_ID,
    {
      id: CALDAV_CONNECTOR_ID,
      moduleId: "connectors/caldav",
      provider: "caldav",
      label: "CalDAV",
      async status(vault) {
        const accounts = vault.getCalDavAccounts();
        return {
          connectorId: CALDAV_CONNECTOR_ID,
          moduleId: "connectors/caldav",
          provider: "caldav",
          label: "CalDAV",
          configured: accounts.length > 0,
          accountCount: accounts.length,
          accounts: accounts.map((account) => ({ id: account.id, label: account.label })),
          vaultOnly: true,
          operations: CALDAV_CONNECTOR_OPERATIONS,
        };
      },
      async invoke(vault, operation, input) {
        return invokeCalDavConnector({ vault }, operation, input);
      },
      operationSpec(operation) {
        return caldavConnectorOperation(operation);
      },
    },
  ],
  [
    CARDDAV_CONNECTOR_ID,
    {
      id: CARDDAV_CONNECTOR_ID,
      moduleId: "connectors/carddav",
      provider: "carddav",
      label: "CardDAV",
      async status(vault) {
        const accounts = vault.getCardDavAccounts();
        return {
          connectorId: CARDDAV_CONNECTOR_ID,
          moduleId: "connectors/carddav",
          provider: "carddav",
          label: "CardDAV",
          configured: accounts.length > 0,
          accountCount: accounts.length,
          accounts: accounts.map((account) => ({ id: account.id, label: account.label })),
          vaultOnly: true,
          operations: CARDDAV_CONNECTOR_OPERATIONS,
        };
      },
      async invoke(vault, operation, input) {
        return invokeCardDavConnector({ vault }, operation, input);
      },
      operationSpec(operation) {
        return carddavConnectorOperation(operation);
      },
    },
  ],
  [
    WEATHER_CONNECTOR_ID,
    {
      id: WEATHER_CONNECTOR_ID,
      moduleId: "connectors/weather",
      provider: "weather",
      label: "Weather",
      async status() {
        return {
          connectorId: WEATHER_CONNECTOR_ID,
          moduleId: "connectors/weather",
          provider: "weather",
          label: "Weather (Open-Meteo)",
          configured: true,
          vaultOnly: false,
          operations: WEATHER_CONNECTOR_OPERATIONS,
        };
      },
      async invoke(vault, operation, input) {
        return invokeWeatherConnector({ vault }, operation, input);
      },
      operationSpec(operation) {
        return weatherConnectorOperation(operation);
      },
    },
  ],
]);

export function getConnectorBackend(connectorId: string): ConnectorBackend | undefined {
  return CONNECTOR_BACKENDS.get(connectorId.trim());
}

export function listConnectorBackendIds(): string[] {
  return [...CONNECTOR_BACKENDS.keys()];
}
