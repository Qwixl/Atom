import { describe, expect, it, vi } from "vitest";
import {
  Catalog,
  ConversationRuntime,
  allowCompositionDuringGame,
  registerCorePrimitives,
} from "@qwixl/shell-core";
import { LlmAgentSession, type LlmConfig } from "@qwixl/agent-llm";

const NEWS_ITEMS = ["Headline one", "Headline two"];

const INTRO_ONLY_CONTENT = JSON.stringify({
  messages: [{ type: "text", text: "Here are the latest news headlines:" }],
});

const REPAIRED_CONTENT = JSON.stringify({
  messages: [
    { type: "text", text: "Here are the latest news headlines:" },
    {
      type: "composition",
      composition: {
        version: 1,
        surfaceId: "news-headlines",
        intent: "Latest news",
        root: {
          id: "news-card",
          component: "core/card",
          semanticRole: "container/card",
          props: { title: "News" },
          children: [
            {
              id: "news-list",
              component: "core/list",
              semanticRole: "collection/list",
              props: { items: NEWS_ITEMS },
            },
          ],
        },
      },
    },
  ],
});

describe("LlmAgentSession list-composition repair", () => {
  it("re-prompts once when a news_search tool call with real items has no composition in the final turn", async () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);

    const runtime = new ConversationRuntime({
      catalog,
      shouldReplaceSurface: (composition, feed) => allowCompositionDuringGame(composition, feed),
    });

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "call-1",
                      type: "function",
                      function: {
                        name: "news_search",
                        arguments: JSON.stringify({ query: "technology" }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      }
      if (call === 2) {
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: INTRO_ONLY_CONTENT } }] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: REPAIRED_CONTENT } }] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: LlmConfig = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      model: "gpt-4o-mini",
    };

    const atomToolExecutor = vi.fn(async () => ({
      operation: "searchItems",
      result: { query: "technology", items: NEWS_ITEMS, source: "google-news-rss" },
    }));

    const session = new LlmAgentSession(
      config,
      catalog,
      () => ({ open: [], guardedCategories: [] }),
      { atomToolExecutor, atomConnectorsAvailable: true },
    );

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

    session.sendUserMessage("what's in the news today?");
    await done;

    // One tool round + one intro-only completion + one corrective repair round.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const { feed } = runtime.getSnapshot();
    expect(feed.some((item) => item.kind === "agent-text")).toBe(true);
    expect(feed.some((item) => item.kind === "surface")).toBe(true);

    vi.unstubAllGlobals();
  });
});
