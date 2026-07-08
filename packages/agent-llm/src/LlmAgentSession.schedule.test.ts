import { describe, expect, it, vi } from "vitest";
import {
  Catalog,
  ConversationRuntime,
  allowCompositionDuringGame,
  registerCorePrimitives,
} from "@qwixl/shell-core";
import { LlmAgentSession, type LlmConfig } from "@qwixl/agent-llm";

const LLM_CONTENT =
  '{"messages":[{"type":"text","text":"Here\'s what\'s on your calendar today."},{"type":"composition","composition":{"version":1,"surfaceId":"schedule-today","intent":"Today\'s calendar events","root":{"id":"schedule-card","component":"core/card","semanticRole":"container/card","props":{"title":"Today"},"children":[{"id":"schedule-list","component":"core/list","semanticRole":"collection/list","props":{"items":["Team standup: Tue, Jul 7, 10:00 AM – 10:30 AM","Reminder - Test!: Tue, Jul 7, 05:00 PM – 06:00 PM"]}}]}}}]}';

describe("LlmAgentSession schedule turn", () => {
  it("delivers text and surface to ConversationRuntime from live LLM JSON shape", async () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);

    const runtime = new ConversationRuntime({
      catalog,
      shouldReplaceSurface: (composition, feed) => allowCompositionDuringGame(composition, feed),
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: LLM_CONTENT } }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const config: LlmConfig = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      model: "gpt-4o-mini",
    };

    const session = new LlmAgentSession(config, catalog, () => ({
      open: [],
      guardedCategories: [],
      calendarContext: "Today:\n- Team standup: Tue, Jul 7, 10:00 AM – 10:30 AM",
    }));

    const done = new Promise<void>((resolve) => {
      const unsub = session.subscribe((output) => {
        void runtime.handleAgentOutput(output).then(() => {
          if (output.type === "done") {
            unsub();
            resolve();
          }
        });
      });
    });

    session.sendUserMessage("what's planned for today?");
    await done;

    const { feed } = runtime.getSnapshot();
    expect(feed.some((item) => item.kind === "agent-text")).toBe(true);
    expect(feed.some((item) => item.kind === "surface")).toBe(true);

    vi.unstubAllGlobals();
  });
});
