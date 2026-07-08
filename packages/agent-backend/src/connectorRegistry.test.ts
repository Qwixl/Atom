import { describe, expect, it } from "vitest";
import { getConnectorBackend, listConnectorBackendIds } from "./connectorRegistry.js";
import { BOOKMARKS_CONNECTOR_ID } from "./bookmarksConnector.js";
import { RSS_CONNECTOR_ID } from "./rssConnector.js";
import { WEBCAL_CONNECTOR_ID } from "./webcalConnector.js";

import { TODOIST_CONNECTOR_ID } from "./todoistConnector.js";
import { GITHUB_CONNECTOR_ID } from "./githubConnector.js";
import { NOTION_CONNECTOR_ID } from "./notionConnector.js";
import { CALDAV_CONNECTOR_ID } from "./caldavConnector.js";
import { CARDDAV_CONNECTOR_ID } from "./carddavConnector.js";
import { LINEAR_CONNECTOR_ID } from "./linearConnector.js";
import { TRELLO_CONNECTOR_ID } from "./trelloConnector.js";
import { HOME_ASSISTANT_CONNECTOR_ID } from "./homeAssistantConnector.js";
import { WEATHER_CONNECTOR_ID } from "./weatherConnector.js";

describe("connectorRegistry", () => {
  it("registers hero connector backends", () => {
    expect(listConnectorBackendIds()).toEqual(
      expect.arrayContaining([
        WEBCAL_CONNECTOR_ID,
        RSS_CONNECTOR_ID,
        BOOKMARKS_CONNECTOR_ID,
        TODOIST_CONNECTOR_ID,
        GITHUB_CONNECTOR_ID,
        NOTION_CONNECTOR_ID,
        LINEAR_CONNECTOR_ID,
        TRELLO_CONNECTOR_ID,
        HOME_ASSISTANT_CONNECTOR_ID,
        CALDAV_CONNECTOR_ID,
        CARDDAV_CONNECTOR_ID,
        WEATHER_CONNECTOR_ID,
      ]),
    );
    expect(getConnectorBackend(WEBCAL_CONNECTOR_ID)?.provider).toBe("webcal");
    expect(getConnectorBackend(RSS_CONNECTOR_ID)?.provider).toBe("rss");
    expect(getConnectorBackend(BOOKMARKS_CONNECTOR_ID)?.provider).toBe("bookmarks");
    expect(getConnectorBackend("news-search")?.provider).toBe("news-search");
  });

  it("returns undefined for unknown connector", () => {
    expect(getConnectorBackend("connectors/unknown")).toBeUndefined();
  });
});
