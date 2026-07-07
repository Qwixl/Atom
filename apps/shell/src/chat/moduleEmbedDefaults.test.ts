import { describe, expect, it } from "vitest";
import type { ResolvedSurface } from "@qwixl/shell-core";
import { findModuleEmbed, withModulePropDefaults } from "./moduleEmbedDefaults.js";

function surfaceWithRoot(root: ResolvedSurface["root"]): ResolvedSurface {
  return { surfaceId: "s1", root, degraded: false };
}

describe("findModuleEmbed", () => {
  it("finds a module at the surface root", () => {
    const surface = surfaceWithRoot({
      kind: "component",
      node: {
        id: "board",
        component: "games/tictactoe",
        props: { turn: "X" },
      },
      entry: {
        origin: "module",
        spec: { name: "games/tictactoe", semanticRole: "input/game-board", moduleId: "games/tictactoe" },
      },
      children: [],
    });
    expect(findModuleEmbed(surface)?.moduleId).toBe("games/tictactoe");
    expect(findModuleEmbed(surface)?.props.turn).toBe("X");
  });

  it("finds a module nested under core/card", () => {
    const surface = surfaceWithRoot({
      kind: "component",
      node: { id: "card", component: "core/card", props: { title: "Game" } },
      entry: { origin: "core", spec: { name: "core/card", semanticRole: "container/card" } },
      children: [
        {
          kind: "component",
          node: { id: "board", component: "games/tictactoe" },
          entry: {
            origin: "module",
            spec: { name: "games/tictactoe", semanticRole: "input/game-board", moduleId: "games/tictactoe" },
          },
          children: [],
        },
      ],
    });
    expect(findModuleEmbed(surface)?.nodeId).toBe("board");
  });
});

describe("withModulePropDefaults", () => {
  it("starts an active tic-tac-toe game when props are empty", () => {
    const props = withModulePropDefaults("games/tictactoe", {});
    expect(props.status).toBe("active");
    expect(props.myMark).toBe("X");
    expect(props.board).toHaveLength(9);
  });

  it("preserves agent-provided board state", () => {
    const board = ["X", null, null, null, "O", null, null, null, null];
    const props = withModulePropDefaults("games/tictactoe", { board, status: "active", turn: "X" });
    expect(props.board).toEqual(board);
  });

  it("defaults meeting picker title", () => {
    expect(withModulePropDefaults("scheduling/meeting-picker", {}).defaultTitle).toBe("Meeting");
  });

  it("defaults poll and shared-list to compose mode", () => {
    expect(withModulePropDefaults("coordination/poll", {}).mode).toBe("compose");
    expect(withModulePropDefaults("coordination/shared-list", {}).mode).toBe("compose");
  });
});
