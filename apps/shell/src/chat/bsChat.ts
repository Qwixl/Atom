import type { Catalog, Composition, ConversationRuntime, ModuleRegistry } from "@qwixl/shell-core";
import { validateShipPlacement } from "../comms/bsLogic.js";
import { isChatOwnedSurface } from "./surfaceId.js";

const BS_COMPONENT = "games/battleships";

function buildChatBsComposition(surfaceId: string, gameId: string): Composition {
  return {
    version: 1,
    surfaceId,
    intent: "Play battleships",
    root: {
      id: "game",
      component: BS_COMPONENT,
      semanticRole: "input/game-board",
      events: ["bsStart", "bsCommit"],
      props: {
        gameId,
        phase: "setup",
        myPlayer: "A",
        readOnly: false,
      },
    },
  };
}

/** Shell-owned battleships board for Chat (ship placement; full P2P via Messages). */
export async function openChatBsBoard(opts: {
  runtime: ConversationRuntime;
  catalog: Catalog;
  registry: ModuleRegistry;
}): Promise<void> {
  const surfaceId = `bs-chat-${Date.now()}`;
  const gameId = `bs-${Date.now()}`;
  const composition = buildChatBsComposition(surfaceId, gameId);
  if (!opts.catalog.lookup(BS_COMPONENT)) {
    try {
      await opts.registry.ensureModules(opts.catalog, composition);
    } catch (error) {
      opts.runtime.appendLocalAgentText(
        error instanceof Error ? error.message : "Could not load battleships module.",
      );
      opts.runtime.setBusy(false);
      return;
    }
  }
  await opts.runtime.showComposition(composition);
  opts.runtime.appendLocalAgentText(
    "Place 6 ship cells on the grid (3 ships × 2 adjacent cells), then tap Commit ships.",
  );
  opts.runtime.setBusy(false);
}

/** Keep battleships module events in Chat — do not bridge to Messages. */
export function handleChatBsUiEvent(
  event: import("@qwixl/shell-core").UiEvent,
  runtime: ConversationRuntime,
): boolean {
  if (!isChatOwnedSurface(event.surfaceId)) return false;
  if (event.name !== "bsStart" && event.name !== "bsCommit") return false;

  if (event.name === "bsStart") {
    runtime.updateSurfaceModuleProps(event.surfaceId, BS_COMPONENT, {
      phase: "setup",
      readOnly: false,
    });
    runtime.appendLocalAgentText("Select ship cells on the grid, then commit when placement is valid.");
    return true;
  }

  const payload = event.payload;
  const cells =
    payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray(payload.cells)
      ? payload.cells.filter((cell): cell is number => typeof cell === "number")
      : [];
  if (!validateShipPlacement(cells)) return false;

  runtime.updateSurfaceModuleProps(event.surfaceId, BS_COMPONENT, {
    phase: "battle",
    readOnly: true,
  });
  runtime.appendLocalAgentText(
    "Ships committed. For a live game with a contact, open Messages — here you can practice placement.",
  );
  return true;
}
