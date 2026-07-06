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
];

export function registerEcosystemModules(catalog: Catalog): void {
  for (const manifest of ECOSYSTEM_MODULE_MANIFESTS) {
    if (!catalog.isModuleInstalled(manifest.id)) {
      catalog.installModule(manifest);
    }
  }
}
