import { describe, expect, it } from "vitest";
import { mergeChatFeedEnvelopes, type ChatFeedEnvelope } from "./chatFeedSync.js";

describe("mergeChatFeedEnvelopes", () => {
  it("merges by id and caps length", () => {
    const local: ChatFeedEnvelope = {
      workspaceId: "personal",
      revision: 2,
      updatedAt: "2026-07-09T10:00:00.000Z",
      items: [
        { kind: "user", id: "item-1", text: "hi" },
        { kind: "agent-text", id: "item-2", text: "hello" },
      ],
    };
    const remote: ChatFeedEnvelope = {
      workspaceId: "personal",
      revision: 3,
      updatedAt: "2026-07-09T11:00:00.000Z",
      items: [
        { kind: "user", id: "item-1", text: "hi" },
        { kind: "agent-text", id: "item-3", text: "from phone" },
      ],
    };
    const merged = mergeChatFeedEnvelopes(local, remote, "personal");
    expect(merged.items.map((i) => i.id)).toEqual(["item-1", "item-3", "item-2"]);
    expect(merged.revision).toBe(4);
  });
});
