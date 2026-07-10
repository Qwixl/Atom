import { describe, expect, it } from "vitest";
import { ConversationRuntime } from "./ConversationRuntime.js";
import { Catalog } from "./catalog.js";

describe("ConversationRuntime.replaceTextFeed", () => {
  it("replaces text items and advances id counter", () => {
    const runtime = new ConversationRuntime({
      catalog: new Catalog(),
      restoreFeed: [{ kind: "user", id: "item-1", text: "old" }],
    });
    runtime.replaceTextFeed([
      { kind: "user", id: "item-5", text: "hi" },
      { kind: "agent-text", id: "item-6", text: "hello" },
    ]);
    const snap = runtime.getSnapshot();
    expect(snap.feed).toHaveLength(2);
    expect(snap.feed[0]).toMatchObject({ id: "item-5", text: "hi" });
    runtime.appendUser("next");
    expect(runtime.getSnapshot().feed.at(-1)?.id).toBe("item-7");
  });
});
