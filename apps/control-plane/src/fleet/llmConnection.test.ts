import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { llmConnectionEnv } from "./llmConnection.js";

describe("llmConnectionEnv", () => {
  it("emits key, OpenRouter base URL, and provider/model id", () => {
    assert.deepEqual(
      llmConnectionEnv({
        apiKey: "sk-or-v1-test",
        baseUrl: "https://openrouter.ai/api/v1/",
        model: "anthropic/claude-sonnet-4",
      }),
      {
        LLM_API_KEY: "sk-or-v1-test",
        LLM_BASE_URL: "https://openrouter.ai/api/v1",
        LLM_MODEL: "anthropic/claude-sonnet-4",
      },
    );
  });

  it("omits empty optional fields", () => {
    assert.deepEqual(llmConnectionEnv({ apiKey: "sk-test" }), { LLM_API_KEY: "sk-test" });
  });
});
