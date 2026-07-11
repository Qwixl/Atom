import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { llmConnectionEnvArgs } from "./llmConnection.js";

describe("llmConnectionEnvArgs", () => {
  it("emits key, OpenRouter base URL, and provider/model id", () => {
    assert.deepEqual(
      llmConnectionEnvArgs({
        apiKey: "sk-or-v1-test",
        baseUrl: "https://openrouter.ai/api/v1/",
        model: "anthropic/claude-sonnet-4",
      }),
      [
        "-e",
        "LLM_API_KEY=sk-or-v1-test",
        "-e",
        "LLM_BASE_URL=https://openrouter.ai/api/v1",
        "-e",
        "LLM_MODEL=anthropic/claude-sonnet-4",
      ],
    );
  });

  it("omits empty optional fields", () => {
    assert.deepEqual(llmConnectionEnvArgs({ apiKey: "sk-test" }), ["-e", "LLM_API_KEY=sk-test"]);
  });
});
