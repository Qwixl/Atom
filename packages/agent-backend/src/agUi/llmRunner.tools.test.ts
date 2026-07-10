import { describe, expect, it, vi } from "vitest";
import type { RunAgentInput } from "@ag-ui/client";
import { runLlmAgUiEvents, type LlmAgUiConfig } from "./llmRunner.js";

function collectEvents(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  return (async () => {
    const out: unknown[] = [];
    for await (const event of gen) out.push(event);
    return out;
  })();
}

describe("runLlmAgUiEvents connector tool loop", () => {
  it("invokes calendar_list_events and returns protocol text", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "calendar_list_events",
                      arguments: JSON.stringify({}),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  messages: [{ type: "text", text: "You have standup at 9." }],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 8 },
        }),
      });

    const connectorExecutor = vi.fn(async () => ({
      events: [{ summary: "Standup", start: "2026-07-09T09:00:00Z" }],
    }));

    const config: LlmAgUiConfig = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      atomConnectorsAvailable: true,
      connectorExecutor,
    };

    const input = {
      threadId: "t1",
      runId: "r1",
      messages: [{ id: "m1", role: "user", content: "What's on today?" }],
      tools: [],
      context: [],
      forwardedProps: {},
      state: {},
    } as unknown as RunAgentInput;

    const events = await collectEvents(runLlmAgUiEvents(input, config));
    expect(connectorExecutor).toHaveBeenCalledWith({
      connectorId: "webcal",
      operation: "listEvents",
      input: undefined,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      messages: Array<{ role: string; tool_call_id?: string }>;
    };
    expect(secondBody.messages.some((m) => m.role === "tool" && m.tool_call_id === "call_1")).toBe(
      true,
    );
    expect(JSON.stringify(events)).toContain("You have standup at 9.");

    vi.unstubAllGlobals();
  });
});
