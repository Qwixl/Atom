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
});
