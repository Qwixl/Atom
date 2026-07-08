import { describe, expect, it } from "vitest";
import type { ResolvedSurface } from "./resolver.js";
import type { FeedItem } from "./conversation.js";
import { findActiveFeedSurface, upsertFeedSurface } from "./conversation.js";

function mockSurface(surfaceId: string, component = "games/tictactoe"): ResolvedSurface {
  return {
    surfaceId,
    intent: "Tic-tac-toe game",
    degraded: false,
    root: {
      kind: "component",
      node: {
        id: "board",
        component,
        props: { board: Array(9).fill(null) },
      },
      entry: {
        origin: "module",
        spec: {
          name: component,
          semanticRole: "input/game-board",
          moduleId: component,
        },
      },
      children: [],
    },
  };
}

describe("composition loop feed policy", () => {
  it("updates an existing surface in place when surfaceId matches", () => {
    const first = upsertFeedSurface([], mockSurface("ttt-1"), "feed-1");
    expect(first).toHaveLength(1);
    expect(first[0]?.kind).toBe("surface");

    const updatedBoard = mockSurface("ttt-1");
    if (updatedBoard.root.kind === "component") {
      updatedBoard.root.node.props = { board: ["X", null, null, null, "O", null, null, null, null] };
    }
    const second = upsertFeedSurface(first, updatedBoard, "feed-1");

    expect(second).toHaveLength(1);
    expect(second[0]?.kind).toBe("surface");
    if (second[0]?.kind === "surface") {
      expect(second[0].surface.surfaceId).toBe("ttt-1");
      expect(second[0].id).toBe("feed-1");
    }
  });

  it("replaces the active surface when surfaceId changes", () => {
    const withFirst = upsertFeedSurface([], mockSurface("ttt-1"), "a");
    const withSecond = upsertFeedSurface(withFirst, mockSurface("ttt-2"), "b");

    expect(withSecond).toHaveLength(1);
    if (withSecond[0]?.kind === "surface") {
      expect(withSecond[0].surface.surfaceId).toBe("ttt-2");
    }
  });

  it("keeps text messages while replacing surfaces", () => {
    let feed = upsertFeedSurface([], mockSurface("ttt-1"), "s1");
    feed = [...feed, { kind: "agent-text", id: "t1", text: "You're X — tap a square." }];
    feed = upsertFeedSurface(feed, mockSurface("ttt-1"), "s1");

    expect(feed.filter((i) => i.kind === "surface")).toHaveLength(1);
    expect(feed.filter((i) => i.kind === "agent-text")).toHaveLength(1);
    expect(feed[feed.length - 1]?.kind).toBe("surface");
  });

  it("moves the active game surface to the feed tail after later turns", () => {
    let feed: FeedItem[] = [];
    feed = [
      ...feed,
      { kind: "user", id: "u1", text: "play tictactoe" },
      { kind: "agent-text", id: "a1", text: "You're X — tap a square." },
    ];
    feed = upsertFeedSurface(feed, mockSurface("ttt-1"), "s1");
    feed = [
      ...feed,
      { kind: "user", id: "u2", text: "cell 4" },
      { kind: "agent-text", id: "a2", text: "Nice move." },
    ];
    feed = upsertFeedSurface(feed, mockSurface("ttt-1"), "s2");

    expect(feed[feed.length - 1]?.kind).toBe("surface");
    if (feed[feed.length - 1]?.kind === "surface") {
      expect(feed[feed.length - 1].surface.surfaceId).toBe("ttt-1");
    }
  });

  it("keeps prior schedule surfaces when a new schedule turn arrives", () => {
    let feed: FeedItem[] = [];
    feed = [
      ...feed,
      { kind: "user", id: "u1", text: "what's on today?" },
      { kind: "agent-text", id: "a1", text: "Here's what's on your calendar today." },
    ];
    feed = upsertFeedSurface(feed, mockSurface("schedule-today", "core/card"), "s1");
    feed = [
      ...feed,
      { kind: "user", id: "u2", text: "what's on today?" },
      { kind: "agent-text", id: "a2", text: "Here's what's on your calendar today." },
    ];
    feed = upsertFeedSurface(feed, mockSurface("schedule-today", "core/card"), "s2");

    expect(feed.filter((item) => item.kind === "surface")).toHaveLength(2);
    expect(feed[2]?.kind).toBe("surface");
    expect(feed[feed.length - 1]?.kind).toBe("surface");
  });

  it("findActiveFeedSurface returns the latest surface metadata", () => {
    let feed = upsertFeedSurface([], mockSurface("ttt-1"), "s1");
    feed = [...feed, { kind: "user", id: "u1", text: "play tictactoe" }];

    expect(findActiveFeedSurface(feed)).toEqual({
      surfaceId: "ttt-1",
      component: "games/tictactoe",
      intent: "Tic-tac-toe game",
    });
  });
});
