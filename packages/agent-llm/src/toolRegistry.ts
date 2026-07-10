/**
 * Per-intent Atom connector tools (D081).
 * Single source of truth for names, descriptions, schemas, and wire mapping.
 */

export type AtomConnectorId =
  | "webcal"
  | "rss"
  | "news-search"
  | "page-fetch"
  | "bookmarks"
  | "todoist"
  | "github"
  | "notion"
  | "linear"
  | "trello"
  | "home-assistant"
  | "caldav"
  | "carddav"
  | "bluesky"
  | "mastodon"
  | "weather";

export interface AtomConnectorInvokeInput {
  connectorId: AtomConnectorId;
  operation: string;
  input?: Record<string, unknown>;
}

export interface RegistryJsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface AtomToolRegistryEntry {
  /** Intent-named tool exposed to the model (e.g. calendar_list_events). */
  name: string;
  description: string;
  parameters: RegistryJsonSchema;
  connectorId: AtomConnectorId;
  operation: string;
  /**
   * When true, expose even if the session has not listed this connector as connected
   * (ephemeral / no vault config: news-search, page-fetch, weather).
   */
  alwaysAvailable?: boolean;
}

const emptyObjectSchema = (): RegistryJsonSchema => ({
  type: "object",
  properties: {},
  additionalProperties: false,
});

/** All read operations the model may call (getStatus folded into result payloads). */
export const ATOM_TOOL_REGISTRY: readonly AtomToolRegistryEntry[] = [
  {
    name: "calendar_list_events",
    description:
      "Tool to list the owner's WebCal calendar events. Use when the owner asks about schedule, today, upcoming, or meetings and needs fresh calendar data. Not for CalDAV accounts (use caldav_list_events) or inventing events.",
    parameters: emptyObjectSchema(),
    connectorId: "webcal",
    operation: "listEvents",
  },
  {
    name: "caldav_list_calendars",
    description:
      "Tool to list CalDAV calendars on the owner's account. Use when choosing which CalDAV calendar to query. Not for WebCal (use calendar_list_events).",
    parameters: emptyObjectSchema(),
    connectorId: "caldav",
    operation: "listCalendars",
  },
  {
    name: "caldav_list_events",
    description:
      "Tool to list events from the owner's CalDAV calendar. Use when the owner uses CalDAV and asks about schedule. Not for WebCal feeds (use calendar_list_events).",
    parameters: emptyObjectSchema(),
    connectorId: "caldav",
    operation: "listEvents",
  },
  {
    name: "contacts_list",
    description:
      "Tool to list CardDAV contacts. Use when the owner asks who someone is or for contact details from their address book. Not for inventing people or searching the public web.",
    parameters: emptyObjectSchema(),
    connectorId: "carddav",
    operation: "listContacts",
  },
  {
    name: "rss_list_items",
    description:
      "Tool to list items from the owner's subscribed RSS/Atom feeds. Use when they ask what is in their feeds or for headlines from configured subscriptions. Not for inventing feed URLs or general web news (use news_search).",
    parameters: emptyObjectSchema(),
    connectorId: "rss",
    operation: "listItems",
  },
  {
    name: "rss_list_podcast_items",
    description:
      "Tool to list podcast episodes from subscribed podcast feeds. Use when the owner asks about podcasts or episodes in their library. Not for general news (use news_search or rss_list_items).",
    parameters: emptyObjectSchema(),
    connectorId: "rss",
    operation: "listPodcastItems",
  },
  {
    name: "news_search",
    description:
      "Tool to search ephemeral public news headlines. Use when researching a topic, briefing topics, or tracking something without a known RSS URL. Not for reading a specific article URL (use page_read) or the owner's subscribed feeds (use rss_list_items).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query, e.g. \"XRP price\" or \"Acme earnings\".",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    connectorId: "news-search",
    operation: "searchItems",
    alwaysAvailable: true,
  },
  {
    name: "page_read",
    description:
      "Tool to fetch the text of a public https page. Use for [link-intent] summarize/full and when the owner gives an article URL. Not for RSS list dumps or inventing page content.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Absolute https URL of the page to read.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    connectorId: "page-fetch",
    operation: "readPage",
    alwaysAvailable: true,
  },
  {
    name: "bookmarks_list",
    description:
      "Tool to list the owner's saved bookmarks. Use when they ask what they saved or for bookmark titles/URLs. Not for fetching page bodies (use page_read with a URL).",
    parameters: emptyObjectSchema(),
    connectorId: "bookmarks",
    operation: "listBookmarks",
  },
  {
    name: "bookmarks_read",
    description:
      "Tool to read one saved bookmark by id. Use when the owner points at a specific bookmark. Not for listing all bookmarks (use bookmarks_list).",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Bookmark id from bookmarks_list.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    connectorId: "bookmarks",
    operation: "readBookmark",
  },
  {
    name: "todoist_list_tasks",
    description:
      "Tool to list Todoist tasks. Use when the owner asks about tasks or to-dos from Todoist. Not for inventing tasks or other task apps.",
    parameters: emptyObjectSchema(),
    connectorId: "todoist",
    operation: "listTasks",
  },
  {
    name: "todoist_list_projects",
    description:
      "Tool to list Todoist projects. Use when choosing a project or the owner asks which projects exist. Not for listing tasks (use todoist_list_tasks).",
    parameters: emptyObjectSchema(),
    connectorId: "todoist",
    operation: "listProjects",
  },
  {
    name: "github_list_notifications",
    description:
      "Tool to list GitHub notifications. Use when the owner asks about GitHub alerts or inbox. Not for assigned issues (use github_list_assigned_issues).",
    parameters: emptyObjectSchema(),
    connectorId: "github",
    operation: "listNotifications",
  },
  {
    name: "github_list_assigned_issues",
    description:
      "Tool to list GitHub issues assigned to the owner. Use when they ask about their issues or assigned work on GitHub. Not for notifications (use github_list_notifications).",
    parameters: emptyObjectSchema(),
    connectorId: "github",
    operation: "listAssignedIssues",
  },
  {
    name: "notion_search",
    description:
      "Tool to search the owner's Notion workspace. Use when they ask to find Notion pages or notes. Not for public web search (use news_search).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Notion search query.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    connectorId: "notion",
    operation: "search",
  },
  {
    name: "linear_list_assigned_issues",
    description:
      "Tool to list Linear issues assigned to the owner. Use when they ask about Linear work. Not for GitHub issues.",
    parameters: emptyObjectSchema(),
    connectorId: "linear",
    operation: "listAssignedIssues",
  },
  {
    name: "trello_list_boards",
    description:
      "Tool to list Trello boards. Use when the owner asks which boards they have. Not for listing cards (use trello_list_cards).",
    parameters: emptyObjectSchema(),
    connectorId: "trello",
    operation: "listBoards",
  },
  {
    name: "trello_list_cards",
    description:
      "Tool to list Trello cards. Use when the owner asks about cards on a board. Not for listing boards only (use trello_list_boards).",
    parameters: emptyObjectSchema(),
    connectorId: "trello",
    operation: "listCards",
  },
  {
    name: "home_assistant_list_entities",
    description:
      "Tool to list Home Assistant entities. Use when browsing devices/entities. Not for a single entity state (use home_assistant_get_entity_state).",
    parameters: emptyObjectSchema(),
    connectorId: "home-assistant",
    operation: "listEntities",
  },
  {
    name: "home_assistant_get_entity_state",
    description:
      "Tool to get one Home Assistant entity state. Use when the owner asks about a specific device or sensor. Not for listing all entities.",
    parameters: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Home Assistant entity id, e.g. light.kitchen.",
        },
      },
      required: ["entityId"],
      additionalProperties: false,
    },
    connectorId: "home-assistant",
    operation: "getEntityState",
  },
  {
    name: "bluesky_list_timeline",
    description:
      "Tool to list the owner's Bluesky home timeline. Use when they ask what is on Bluesky. Not for Mastodon (use mastodon_list_home_timeline).",
    parameters: emptyObjectSchema(),
    connectorId: "bluesky",
    operation: "listTimeline",
  },
  {
    name: "bluesky_list_notifications",
    description:
      "Tool to list Bluesky notifications. Use when the owner asks about Bluesky alerts. Not for the timeline feed.",
    parameters: emptyObjectSchema(),
    connectorId: "bluesky",
    operation: "listNotifications",
  },
  {
    name: "mastodon_list_home_timeline",
    description:
      "Tool to list the owner's Mastodon home timeline. Use when they ask about Mastodon. Not for Bluesky.",
    parameters: emptyObjectSchema(),
    connectorId: "mastodon",
    operation: "listHomeTimeline",
  },
  {
    name: "mastodon_list_notifications",
    description:
      "Tool to list Mastodon notifications. Use when the owner asks about Mastodon alerts. Not for the home timeline.",
    parameters: emptyObjectSchema(),
    connectorId: "mastodon",
    operation: "listNotifications",
  },
  {
    name: "weather_get_forecast",
    description:
      "Tool to get an Open-Meteo weather forecast. Use when the owner asks about weather for a named place or after they grant a location fix. Not for inventing temperatures without calling this tool.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Place name, e.g. \"Berlin\" or \"London\". Prefer this when the owner named a place.",
        },
        latitude: {
          type: "number",
          description: "Latitude when using a one-shot device fix.",
        },
        longitude: {
          type: "number",
          description: "Longitude when using a one-shot device fix.",
        },
      },
      additionalProperties: false,
    },
    connectorId: "weather",
    operation: "getForecast",
    alwaysAvailable: true,
  },
];

const BY_NAME = new Map(ATOM_TOOL_REGISTRY.map((e) => [e.name, e]));

export const ATOM_CONNECTOR_INVOKE_ALIAS = "atom_connector_invoke";

export function getToolRegistryEntry(name: string): AtomToolRegistryEntry | undefined {
  return BY_NAME.get(name);
}

export function listToolRegistryEntries(opts?: {
  connectedConnectorIds?: readonly AtomConnectorId[];
}): AtomToolRegistryEntry[] {
  const connected = opts?.connectedConnectorIds;
  if (!connected) return [...ATOM_TOOL_REGISTRY];
  const set = new Set(connected);
  return ATOM_TOOL_REGISTRY.filter(
    (e) => e.alwaysAvailable === true || set.has(e.connectorId),
  );
}

export function registryEntryToChatCompletionTool(entry: AtomToolRegistryEntry): {
  type: "function";
  function: { name: string; description: string; parameters: RegistryJsonSchema };
} {
  return {
    type: "function",
    function: {
      name: entry.name,
      description: entry.description,
      parameters: entry.parameters,
    },
  };
}

export function registryEntryToResponsesTool(entry: AtomToolRegistryEntry): {
  type: "function";
  name: string;
  description: string;
  parameters: RegistryJsonSchema;
  strict: false;
} {
  return {
    type: "function",
    name: entry.name,
    description: entry.description,
    parameters: entry.parameters,
    strict: false,
  };
}

/** Validate model args against the registry schema; return readable errors. */
export function validateRegistryToolArgs(
  entry: AtomToolRegistryEntry,
  raw: Record<string, unknown>,
): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  const required = entry.parameters.required ?? [];
  for (const key of required) {
    const value = raw[key];
    if (value === undefined || value === null || value === "") {
      const prop = entry.parameters.properties[key] as { description?: string } | undefined;
      const hint = prop?.description ? ` ${prop.description}` : "";
      return { ok: false, error: `missing \`${key}\`;${hint}` };
    }
  }
  if (entry.name === "page_read") {
    const url = String(raw.url ?? "");
    if (!/^https:\/\//i.test(url)) {
      return { ok: false, error: "missing `url`; expected an https article URL" };
    }
  }
  if (entry.name === "weather_get_forecast") {
    const hasLocation = typeof raw.location === "string" && raw.location.trim().length > 0;
    const hasCoords =
      typeof raw.latitude === "number" &&
      Number.isFinite(raw.latitude) &&
      typeof raw.longitude === "number" &&
      Number.isFinite(raw.longitude);
    if (!hasLocation && !hasCoords) {
      return {
        ok: false,
        error: "provide `location` (place name) or both `latitude` and `longitude`",
      };
    }
  }
  const input: Record<string, unknown> = {};
  for (const key of Object.keys(entry.parameters.properties)) {
    if (raw[key] !== undefined) input[key] = raw[key];
  }
  return { ok: true, input };
}

/**
 * Resolve a native tool call name + JSON args into the connector wire shape.
 * Accepts per-intent registry names and the deprecated atom_connector_invoke alias.
 */
export function resolveToolCallToConnectorInvoke(
  name: string,
  argsJson: string,
): { ok: true; call: AtomConnectorInvokeInput } | { ok: false; error: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "tool arguments must be valid JSON" };
  }

  if (name === ATOM_CONNECTOR_INVOKE_ALIAS) {
    const connectorId = String(parsed.connectorId ?? "").trim() as AtomConnectorId;
    const operation = String(parsed.operation ?? "").trim();
    if (!connectorId || !operation) {
      return {
        ok: false,
        error: "atom_connector_invoke requires connectorId and operation (deprecated alias)",
      };
    }
    const input =
      parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input)
        ? (parsed.input as Record<string, unknown>)
        : undefined;
    return { ok: true, call: { connectorId, operation, input } };
  }

  const entry = getToolRegistryEntry(name);
  if (!entry) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }

  const validated = validateRegistryToolArgs(entry, parsed);
  if (!validated.ok) return validated;

  return {
    ok: true,
    call: {
      connectorId: entry.connectorId,
      operation: entry.operation,
      input: Object.keys(validated.input).length > 0 ? validated.input : undefined,
    },
  };
}

/** Resolve optional AG-UI toolName (+ legacy connectorId/operation) to wire shape. */
export function resolveAgUiConnectorInvoke(body: {
  toolName?: string;
  connectorId?: string;
  operation?: string;
  input?: Record<string, unknown>;
}): { ok: true; call: AtomConnectorInvokeInput } | { ok: false; error: string } {
  if (body.toolName) {
    return resolveToolCallToConnectorInvoke(
      body.toolName,
      JSON.stringify(body.input ?? {}),
    );
  }
  const connectorId = String(body.connectorId ?? "").trim() as AtomConnectorId;
  const operation = String(body.operation ?? "").trim();
  if (!connectorId || !operation) {
    return { ok: false, error: "connector invoke requires toolName or connectorId+operation" };
  }
  return {
    ok: true,
    call: {
      connectorId,
      operation,
      input: body.input,
    },
  };
}
