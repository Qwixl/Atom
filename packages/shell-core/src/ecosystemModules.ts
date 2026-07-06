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
          "Inline date/time picker for proposing a 1:1 meeting. Use when the owner wants to schedule, meet, book, or arrange a call. Props: { defaultTitle?, peerName? }. Emits meetingProposed with { title, slots }.",
      },
    ],
    capabilities: [],
    categories: ["scheduling", "coordination"],
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
