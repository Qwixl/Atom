/**
 * Tool-judgment eval scenarios (D081). Private-safe — no personal data.
 */

export type ToolCallExpectation = {
  name: string;
  /** Optional predicates on parsed JSON args. */
  argsIncludes?: Record<string, unknown>;
};

export type ToolEvalScenario = {
  id: string;
  description: string;
  userMessage: string;
  calendarContext?: string;
  rssContext?: string;
  connectedConnectorIds?: string[];
  /** Expected at least one of these tools (name match). */
  expectAnyTool?: ToolCallExpectation[];
  /**
   * When true with expectAnyTool: empty tool list also passes
   * (honest no-tool answer OK; still fail on wrong tools / bad args).
   */
  allowNoTool?: boolean;
  /** Must not call any connector/registry tool. */
  expectNoTool?: boolean;
  /** Final protocol must include settingsProposal consequential-action. */
  expectSettingsProposal?: boolean;
  /** Final protocol must not include briefing-daily surface. */
  forbidBriefingDaily?: boolean;
};

export const TOOL_EVAL_SCENARIOS: ToolEvalScenario[] = [
  {
    id: "calendar-fresh",
    description: "Schedule question should call calendar_list_events even with snapshot",
    userMessage: "What's on my calendar today?",
    calendarContext: "Connected.\nToday:\n- Standup: 9:00 AM",
    connectedConnectorIds: ["webcal"],
    expectAnyTool: [{ name: "calendar_list_events" }],
  },
  {
    id: "calendar-alias-ok",
    description: "Deprecated alias still acceptable for calendar",
    userMessage: "List my events for today please",
    calendarContext: "Connected.\nToday:\n(no events)",
    connectedConnectorIds: ["webcal"],
    expectAnyTool: [
      { name: "calendar_list_events" },
      { name: "atom_connector_invoke" },
    ],
  },
  {
    id: "rss-fresh",
    description: "Feed question should call rss_list_items",
    userMessage: "What's in my RSS feeds?",
    rssContext: "Connected.\n- [Old headline](https://example.com/old)",
    connectedConnectorIds: ["rss"],
    expectAnyTool: [{ name: "rss_list_items" }],
  },
  {
    id: "news-search-topic",
    description: "Topic research uses news_search",
    userMessage: "Find recent headlines about XRP price",
    expectAnyTool: [{ name: "news_search", argsIncludes: { query: "XRP" } }],
  },
  {
    id: "page-read-link-intent",
    description: "link-intent summarize must page_read",
    userMessage:
      '[link-intent] {"intent":"summarize","url":"https://example.com/article","title":"Example"}',
    expectAnyTool: [
      { name: "page_read", argsIncludes: { url: "https://example.com/article" } },
    ],
    forbidBriefingDaily: true,
  },
  {
    id: "link-intent-not-rss",
    description: "link-intent must not dump RSS snapshot without page_read",
    userMessage:
      '[link-intent] {"intent":"full","url":"https://news.example.com/story","title":"Story"}',
    rssContext: "Connected.\n- [Unrelated](https://feeds.example.com/1)",
    connectedConnectorIds: ["rss"],
    expectAnyTool: [{ name: "page_read" }],
  },
  {
    id: "weather-named-place",
    description: "Weather for a named city",
    userMessage: "What's the weather in Berlin?",
    expectAnyTool: [{ name: "weather_get_forecast" }],
  },
  {
    id: "settings-soft-confirm-xrp",
    description: "Track/alert request must emit settingsProposal (research optional)",
    userMessage:
      "Find the XRP price, give me a daily update, and alert if it fluctuates 5% over the week",
    expectAnyTool: [{ name: "news_search" }],
    allowNoTool: true,
    expectSettingsProposal: true,
    forbidBriefingDaily: true,
  },
  {
    id: "settings-assent-no-briefing",
    description: "settings-assent must not emit briefing-daily",
    userMessage:
      "[settings-assent] Owner confirmed your offer to track/update/alert. Emit settingsProposal.",
    expectSettingsProposal: true,
    forbidBriefingDaily: true,
  },
  {
    id: "no-tool-greeting",
    description: "Simple greeting needs no tools",
    userMessage: "Hi",
    expectNoTool: true,
    forbidBriefingDaily: true,
  },
  {
    id: "no-tool-thanks",
    description: "Thanks alone needs no tools",
    userMessage: "thanks",
    expectNoTool: true,
    forbidBriefingDaily: true,
  },
  {
    id: "briefing-open-ok",
    description: "Explicit briefing turn may compose briefing-daily",
    userMessage: "[briefing-open] Compose today's daily briefing.",
    calendarContext: "Connected.\nToday:\n(no events)\nUpcoming:\nnone",
    rssContext: "Connected.\n- [News](https://example.com/n)",
    connectedConnectorIds: ["webcal", "rss"],
  },
  {
    id: "unsolicited-briefing-forbidden",
    description: "Casual chat must not emit briefing-daily",
    userMessage: "Tell me a fun fact about cats",
    expectNoTool: true,
    forbidBriefingDaily: true,
  },
  {
    id: "bookmarks-list",
    description: "Bookmarks question uses bookmarks_list",
    userMessage: "What bookmarks have I saved?",
    connectedConnectorIds: ["bookmarks"],
    expectAnyTool: [{ name: "bookmarks_list" }],
  },
  {
    id: "todoist-tasks",
    description: "Todoist tasks question",
    userMessage: "What are my Todoist tasks?",
    connectedConnectorIds: ["todoist"],
    expectAnyTool: [{ name: "todoist_list_tasks" }],
  },
  {
    id: "github-notifications",
    description: "GitHub notifications",
    userMessage: "Any GitHub notifications?",
    connectedConnectorIds: ["github"],
    expectAnyTool: [{ name: "github_list_notifications" }],
  },
  {
    id: "notion-search",
    description: "Notion search",
    userMessage: "Search my Notion for onboarding notes",
    connectedConnectorIds: ["notion"],
    expectAnyTool: [{ name: "notion_search" }],
  },
  {
    id: "wrong-tool-not-rss-for-price",
    description: "Price research should use news_search not rss when no crypto feed",
    userMessage: "What's the latest on Bitcoin price moves this week?",
    connectedConnectorIds: ["rss"],
    rssContext: "Connected.\n- [World Cup](https://example.com/wc)",
    expectAnyTool: [{ name: "news_search" }],
  },
  {
    id: "podcast-items",
    description: "Podcast play request uses rss_list_podcast_items",
    userMessage: "Play the latest episode from my podcasts",
    connectedConnectorIds: ["rss"],
    expectAnyTool: [{ name: "rss_list_podcast_items" }],
  },
  {
    id: "caldav-events",
    description: "CalDAV schedule uses caldav_list_events",
    userMessage: "What's on my CalDAV calendar?",
    connectedConnectorIds: ["caldav"],
    expectAnyTool: [{ name: "caldav_list_events" }],
  },
  {
    id: "contacts",
    description: "Contacts list",
    userMessage: "List my CardDAV contacts",
    connectedConnectorIds: ["carddav"],
    expectAnyTool: [{ name: "contacts_list" }],
  },
  {
    id: "linear-issues",
    description: "Linear assigned issues",
    userMessage: "What Linear issues are assigned to me?",
    connectedConnectorIds: ["linear"],
    expectAnyTool: [{ name: "linear_list_assigned_issues" }],
  },
  {
    id: "trello-boards",
    description: "Trello boards",
    userMessage: "List my Trello boards",
    connectedConnectorIds: ["trello"],
    expectAnyTool: [{ name: "trello_list_boards" }],
  },
  {
    id: "bluesky-timeline",
    description: "Bluesky timeline",
    userMessage: "What's on my Bluesky timeline?",
    connectedConnectorIds: ["bluesky"],
    expectAnyTool: [{ name: "bluesky_list_timeline" }],
  },
  {
    id: "mastodon-timeline",
    description: "Mastodon home timeline",
    userMessage: "Show my Mastodon home timeline",
    connectedConnectorIds: ["mastodon"],
    expectAnyTool: [{ name: "mastodon_list_home_timeline" }],
  },
  {
    id: "home-assistant-entities",
    description: "Home Assistant entities",
    userMessage: "List my Home Assistant entities",
    connectedConnectorIds: ["home-assistant"],
    expectAnyTool: [{ name: "home_assistant_list_entities" }],
  },
  {
    id: "no-hallucinated-web-search",
    description:
      "Without web_search wired: news_search for news OK, or honest no-tool — never invent search",
    userMessage: "Search the web for Atom generative UI",
    expectAnyTool: [{ name: "news_search" }],
    allowNoTool: true,
    forbidBriefingDaily: true,
  },
  {
    id: "settings-no-text-only",
    description: "Soft confirm track request forbids briefing",
    userMessage: "Keep me updated daily on Acme stock and alert on big moves",
    expectSettingsProposal: true,
    forbidBriefingDaily: true,
  },
  {
    id: "empty-calendar-snapshot-still-invoke",
    description: "Empty snapshot still prefer invoke for schedule ask",
    userMessage: "Do I have anything this afternoon?",
    calendarContext: "Connected.\nToday:\n(no events)",
    connectedConnectorIds: ["webcal"],
    expectAnyTool: [{ name: "calendar_list_events" }],
  },
  {
    id: "page-read-https-only",
    description: "Explicit URL summarize",
    userMessage: "Summarize https://example.com/docs/guide for me",
    expectAnyTool: [{ name: "page_read" }],
  },
];
