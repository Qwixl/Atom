import type { Catalog, ModuleManifest } from "./catalog.js";

/** Built-in coordination/game modules shipped with the shell (registry parity). */
export const ECOSYSTEM_MODULE_MANIFESTS: ModuleManifest[] = [
  {
    id: "scheduling/meeting-picker",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/scheduling-meeting-picker/index.html",
    components: [
      {
        name: "scheduling/meeting-picker",
        semanticRole: "input/datetime-picker",
        events: [{ name: "meetingProposed" }],
        agentHint:
          "Inline date/time picker for proposing a 1:1 meeting. Use when the owner wants to schedule, meet, book, or arrange a call. Props: { defaultTitle?, peerName?, busyEvents? }. Emits meetingProposed with { title, slots }.",
      },
    ],
    capabilities: [],
    categories: ["scheduling", "coordination"],
    tier: "system",
  },
  {
    id: "connectors/webcal",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/connectors-webcal/index.html",
    connector: {
      agentId: "webcal",
      provider: "webcal",
      label: "WebCal",
      operations: [
        { id: "getStatus", permission: "read", description: "Feed configuration status." },
        { id: "listEvents", permission: "read", description: "List events in a time range." },
      ],
    },
    components: [
      {
        name: "connectors/webcal",
        semanticRole: "settings/connector",
        events: [{ name: "setFeedRequested" }, { name: "removeFeedRequested" }, { name: "refreshRequested" }],
        agentHint:
          "WebCal connector settings: owner pastes a private ICS feed URL; agent vault stores it for read-only listEvents.",
      },
    ],
    capabilities: [],
    categories: ["connectors", "scheduling"],
    tier: "system",
  },
  {
    id: "connectors/rss",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/connectors-rss/index.html",
    connector: {
      agentId: "rss",
      provider: "rss",
      label: "RSS",
      operations: [
        { id: "getStatus", permission: "read", description: "Feed configuration status." },
        { id: "listItems", permission: "read", description: "List recent RSS/Atom items." },
      ],
    },
    components: [
      {
        name: "connectors/rss",
        semanticRole: "settings/connector",
        events: [{ name: "setFeedRequested" }, { name: "removeFeedRequested" }, { name: "refreshRequested" }],
        agentHint:
          "RSS connector settings: owner pastes a public feed URL; agent vault stores it for read-only listItems.",
      },
    ],
    capabilities: [],
    categories: ["connectors", "comms"],
    tier: "system",
  },
  {
    id: "connectors/bookmarks",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/connectors-bookmarks/index.html",
    connector: {
      agentId: "bookmarks",
      provider: "bookmarks",
      label: "Bookmarks",
      operations: [
        { id: "getStatus", permission: "read", description: "Bookmark configuration status." },
        { id: "listBookmarks", permission: "read", description: "List saved bookmarks." },
        { id: "readBookmark", permission: "read", description: "Fetch plain text from a saved bookmark." },
      ],
    },
    components: [
      {
        name: "connectors/bookmarks",
        semanticRole: "settings/connector",
        events: [{ name: "setBookmarkRequested" }, { name: "removeBookmarkRequested" }, { name: "refreshRequested" }],
        agentHint:
          "Bookmarks connector: owner saves HTTPS page URLs; agent invokes readBookmark for excerpts on request.",
      },
    ],
    capabilities: [],
    categories: ["connectors", "knowledge"],
    tier: "system",
  },
  {
    id: "coordination/poll",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/coordination-poll/index.html",
    components: [
      {
        name: "coordination/poll",
        semanticRole: "input/poll",
        events: [{ name: "pollCreated" }, { name: "pollVote" }],
        agentHint:
          "Create or vote on a group poll. Use when deciding between options (where to eat, which day, etc.). Props: { mode?: 'compose' | 'vote', question?, options?, pollId? }. Emits pollCreated or pollVote.",
      },
    ],
    capabilities: [],
    categories: ["coordination"],
    tier: "system",
  },
  {
    id: "games/tictactoe",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/games-tictactoe/index.html",
    components: [
      {
        name: "games/tictactoe",
        semanticRole: "input/game-board",
        events: [{ name: "tttStart" }, { name: "tttMove" }],
        agentHint:
          "Tic-tac-toe board for play with a contact. Use when the owner wants to play a game. Emits tttStart or tttMove.",
      },
    ],
    capabilities: [],
    categories: ["games"],
    tier: "system",
  },
  {
    id: "games/battleships",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/games-battleships/index.html",
    components: [
      {
        name: "games/battleships",
        semanticRole: "input/game-board",
        events: [{ name: "bsStart" }, { name: "bsCommit" }],
        agentHint:
          "Battleships with hidden ship commitments. 6×6 grid, 3 ships of 2 cells. Emits bsStart or bsCommit; battle shots fire from the thread card.",
      },
    ],
    capabilities: [],
    categories: ["games"],
    tier: "system",
  },
  {
    id: "coordination/shared-list",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/coordination-shared-list/index.html",
    components: [
      {
        name: "coordination/shared-list",
        semanticRole: "input/shared-list",
        events: [{ name: "listCreated" }, { name: "listUpdated" }],
        agentHint:
          "Collaborative checklist between two contacts. Use for groceries, todos, packing lists. Props: { mode?: 'compose', defaultTitle? }. Emits listCreated with { title, items }.",
      },
    ],
    capabilities: [],
    categories: ["coordination"],
    tier: "system",
  },
  {
    id: "family/location-pin",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/family-location-pin/index.html",
    components: [
      {
        name: "family/location-pin",
        semanticRole: "input/location-pin",
        events: [{ name: "locationPinCreated" }],
        agentHint:
          "Share a meeting point (label + lat/lng) with a contact. Use for meet here, pickup spot, family rendezvous. Props: { mode?: 'compose', defaultLabel? }. Emits locationPinCreated with { label, lat, lng, note? }.",
      },
    ],
    capabilities: [],
    categories: ["family", "friends", "coordination"],
    tier: "system",
  },
  {
    id: "commerce/split-bill",
    version: "1.0.0",
    publisher: "did:key:z6Mkatomexamples01",
    targets: ["web"],
    bundleUrl: "/modules/commerce-split-bill/index.html",
    components: [
      {
        name: "commerce/split-bill",
        semanticRole: "input/split-bill",
        events: [{ name: "splitProposed" }],
        agentHint:
          "Propose splitting a bill between contacts. Use when the owner wants to split costs, divide a check, or share an expense. Props: { defaultLabel? }. Emits splitProposed with { label, totalMinor, currency, splitCount, shareMinor }.",
      },
    ],
    capabilities: [],
    categories: ["commerce"],
    tier: "system",
  },
];

export function registerEcosystemModules(catalog: Catalog): void {
  for (const manifest of ECOSYSTEM_MODULE_MANIFESTS) {
    if (!catalog.isModuleInstalled(manifest.id)) {
      catalog.installModule(manifest);
    }
  }
}
