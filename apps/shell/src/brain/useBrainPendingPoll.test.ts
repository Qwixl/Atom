import { describe, expect, it } from "vitest";
import { Catalog, ConversationRuntime } from "@qwixl/shell-core";
import {
  deliverBrainPendingToFeed,
  formatBrainNotificationText,
} from "./useBrainPendingPoll.js";
import type { BrainPendingNotification } from "../custody/client.js";

describe("deliverBrainPendingToFeed", () => {
  it("formats and appends brain lines with origin, skipping duplicates", () => {
    const runtime = new ConversationRuntime({ catalog: new Catalog([]) });
    const n: BrainPendingNotification = {
      id: "brain_1",
      intentId: "intent_1",
      kind: "reminder",
      title: "Call bank",
      body: "Call bank",
      createdAt: "2026-07-10T12:00:00.000Z",
      deliveredAt: null,
    };
    expect(formatBrainNotificationText(n)).toBe("Call bank");
    return deliverBrainPendingToFeed(runtime, [n, n]).then((ids) => {
      expect(ids).toEqual(["brain_1", "brain_1"]);
      const feed = runtime.getSnapshot().feed;
      expect(feed).toHaveLength(1);
      expect(feed[0]).toMatchObject({
        kind: "agent-text",
        id: "brain_1",
        origin: "brain",
        brainKind: "reminder",
      });
    });
  });

  it("strips Chat JSON from watch bodies", () => {
    const n: BrainPendingNotification = {
      id: "brain_w",
      intentId: "intent_w",
      kind: "watch",
      title: "Watch",
      body: `Watch: ${JSON.stringify({ messages: [{ type: "text", text: "Score 2-1" }] })}`,
      createdAt: "2026-07-10T12:00:00.000Z",
    };
    expect(formatBrainNotificationText(n)).toContain("Score 2-1");
    expect(formatBrainNotificationText(n)).not.toContain('"messages"');
  });

  it("fires daily-briefing hook and appends thin badge (not ask-me stub)", async () => {
    const runtime = new ConversationRuntime({ catalog: new Catalog([]) });
    let fired = false;
    const n: BrainPendingNotification = {
      id: "brain_b",
      intentId: "intent_b",
      kind: "daily-briefing",
      title: "Morning briefing",
      body: "Ask me for today's briefing when you're free",
      createdAt: "2026-07-10T12:00:00.000Z",
    };
    const ids = await deliverBrainPendingToFeed(runtime, [n], {
      onDailyBriefingFire: () => {
        fired = true;
        return true;
      },
    });
    expect(fired).toBe(true);
    expect(ids).toEqual(["brain_b"]);
    const feed = runtime.getSnapshot().feed;
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: "agent-text",
      id: "brain_b",
      text: "Morning briefing",
      origin: "brain",
      brainKind: "daily-briefing",
    });
  });

  it("defers daily-briefing ack when the fire hook returns false", async () => {
    const runtime = new ConversationRuntime({ catalog: new Catalog([]) });
    const n: BrainPendingNotification = {
      id: "brain_defer",
      intentId: "intent_b",
      kind: "daily-briefing",
      title: "Morning briefing",
      body: "ready",
      createdAt: "2026-07-10T12:00:00.000Z",
    };
    const ids = await deliverBrainPendingToFeed(runtime, [n], {
      onDailyBriefingFire: () => false,
    });
    expect(ids).toEqual([]);
    expect(runtime.getSnapshot().feed).toHaveLength(0);
  });
});
