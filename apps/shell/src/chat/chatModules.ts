import type {
  Catalog,
  Composition,
  ConversationRuntime,
  FeedItem,
  ModuleRegistry,
  ResolvedNode,
  ResolvedSurface,
} from "@qwixl/shell-core";
import { openChatBsBoard } from "./bsChat.js";
import { openChatTttBoard } from "./tttChat.js";

export interface ChatModuleSpec {
  component: string;
  surfacePrefix: string;
  contextPattern: RegExp;
  matchIntent: (text: string) => boolean;
  buildComposition: (surfaceId: string) => Composition;
  introMessage: string;
}

const MODULE_RETRY =
  /\b(try again|retry|render|didn't render|did not render|not render|show (the )?(board|module)|fix the board|board again|display)\b/i;

function surfaceHasComponent(surface: ResolvedSurface, component: string): boolean {
  const walk = (node: ResolvedNode): boolean => {
    if (node.node.component === component) return true;
    return node.children.some(walk);
  };
  return walk(surface.root);
}

function feedHasModuleContext(feed: readonly FeedItem[], spec: ChatModuleSpec): boolean {
  return feed.slice(-12).some((item) => {
    if (item.kind === "user" && spec.matchIntent(item.text)) return true;
    if (item.kind === "agent-text" && spec.contextPattern.test(item.text)) return true;
    if (item.kind === "surface" && surfaceHasComponent(item.surface, spec.component)) return true;
    return false;
  });
}

const CHAT_MODULE_SPECS: ChatModuleSpec[] = [
  {
    component: "games/battleships",
    surfacePrefix: "bs",
    contextPattern: /\bbattle\s*ship/i,
    matchIntent: (text) =>
      /\b(battleships?|battle\s*ships?|sink\s*(my\s*)?ships?)\b/i.test(text) ||
      /(play|start|try).*(battleships?|battle\s*ships?)/i.test(text),
    buildComposition: (surfaceId) => ({
      version: 1,
      surfaceId,
      intent: "Play battleships",
      root: {
        id: "game",
        component: "games/battleships",
        semanticRole: "input/game-board",
        events: ["bsStart", "bsCommit"],
        props: {
          gameId: surfaceId.replace(/^bs-chat-/, "bs-"),
          phase: "setup",
          myPlayer: "A",
          readOnly: false,
        },
      },
    }),
    introMessage: "Place your ships on the grid (6 cells — 3 ships × 2 adjacent cells), then tap Commit.",
  },
  {
    component: "games/tictactoe",
    surfacePrefix: "ttt",
    contextPattern: /\btic[\s-]?tac[\s-]?toe\b/i,
    matchIntent: (text) => {
      const lower = text.trim().toLowerCase();
      if (/\b(tic[\s-]?tac[\s-]?toe|tictactoe)\b/i.test(lower)) return true;
      if (/new game.*(tic|toe|tictactoe)/.test(lower)) return true;
      if (/(play|start|try).*(tic|tictactoe|tic-tac-toe)/.test(lower)) return true;
      return false;
    },
    buildComposition: () => {
      throw new Error("tictactoe uses dedicated openChatTttBoard");
    },
    introMessage: "",
  },
  {
    component: "scheduling/meeting-picker",
    surfacePrefix: "meet",
    contextPattern: /\b(schedule|meeting|appointment|book a call)\b/i,
    matchIntent: (text) =>
      /\b(schedule|book|arrange|set up)\b.*\b(meet(ing)?|call|appointment|time)\b/i.test(text) ||
      /\blet'?s meet\b/i.test(text) ||
      /\bmeeting picker\b/i.test(text),
    buildComposition: (surfaceId) => ({
      version: 1,
      surfaceId,
      intent: "Schedule a meeting",
      root: {
        id: "picker",
        component: "scheduling/meeting-picker",
        semanticRole: "input/datetime-picker",
        events: ["meetingProposed"],
        props: { defaultTitle: "Meeting" },
      },
    }),
    introMessage: "Pick a time below — I'll route the proposal to Messages when you send it.",
  },
  {
    component: "coordination/poll",
    surfacePrefix: "poll",
    contextPattern: /\bpoll\b/i,
    matchIntent: (text) =>
      /\b(poll|vote on|which (day|option|date|place|restaurant)|where should we)\b/i.test(text) ||
      /\bcreate a poll\b/i.test(text),
    buildComposition: (surfaceId) => ({
      version: 1,
      surfaceId,
      intent: "Create a poll",
      root: {
        id: "poll",
        component: "coordination/poll",
        semanticRole: "input/poll",
        events: ["pollCreated", "pollVote"],
        props: { mode: "compose" },
      },
    }),
    introMessage: "Fill in the poll below — options go to Messages when you send.",
  },
  {
    component: "coordination/shared-list",
    surfacePrefix: "list",
    contextPattern: /\b(list|checklist|groceries|packing)\b/i,
    matchIntent: (text) =>
      /\b((shared |grocery|packing|todo|check)[\s-]*(list|checklist)|checklist)\b/i.test(text) ||
      /\bmake a list\b/i.test(text),
    buildComposition: (surfaceId) => ({
      version: 1,
      surfaceId,
      intent: "Shared checklist",
      root: {
        id: "list",
        component: "coordination/shared-list",
        semanticRole: "input/shared-list",
        events: ["listCreated", "listUpdated"],
        props: { mode: "compose", defaultTitle: "Shared list" },
      },
    }),
    introMessage: "Add list items below — send when ready to share via Messages.",
  },
];

export { isChatOwnedSurface } from "./surfaceId.js";

export function matchChatModuleIntent(
  text: string,
  feed: readonly FeedItem[],
): ChatModuleSpec | null {
  const trimmed = text.trim();
  for (const spec of CHAT_MODULE_SPECS) {
    if (spec.matchIntent(trimmed)) return spec;
  }
  if (MODULE_RETRY.test(trimmed)) {
    for (const spec of CHAT_MODULE_SPECS) {
      if (feedHasModuleContext(feed, spec)) return spec;
    }
  }
  return null;
}

async function ensureComponent(
  catalog: Catalog,
  registry: ModuleRegistry,
  composition: Composition,
  component: string,
): Promise<string | null> {
  if (catalog.lookup(component)) return null;
  try {
    await registry.ensureModules(catalog, composition);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not load module.";
  }
}

async function openGenericChatModule(
  spec: ChatModuleSpec,
  opts: { runtime: ConversationRuntime; catalog: Catalog; registry: ModuleRegistry },
): Promise<void> {
  const surfaceId = `${spec.surfacePrefix}-chat-${Date.now()}`;
  const composition = spec.buildComposition(surfaceId);
  const error = await ensureComponent(opts.catalog, opts.registry, composition, spec.component);
  if (error) {
    opts.runtime.appendLocalAgentText(error);
    opts.runtime.setBusy(false);
    return;
  }
  await opts.runtime.showComposition(composition);
  opts.runtime.appendLocalAgentText(spec.introMessage);
  opts.runtime.setBusy(false);
}

/** Shell-owned module mount — do not rely on the LLM to compose registry modules in Chat. */
export async function openChatModuleForIntent(
  text: string,
  feed: readonly FeedItem[],
  opts: { runtime: ConversationRuntime; catalog: Catalog; registry: ModuleRegistry },
): Promise<boolean> {
  const spec = matchChatModuleIntent(text, feed);
  if (!spec) return false;

  if (spec.component === "games/tictactoe") {
    await openChatTttBoard(opts);
    return true;
  }
  if (spec.component === "games/battleships") {
    await openChatBsBoard(opts);
    return true;
  }
  await openGenericChatModule(spec, opts);
  return true;
}
