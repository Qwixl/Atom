import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { probeLlmConnection } from "./llmProbe.js";

describe("probeLlmConnection", () => {
  it("returns ok when provider responds 200", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    try {
      const result = await probeLlmConnection({
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1/",
        model: "gpt-4o-mini",
      });
      assert.deepEqual(result, { ok: true, model: "gpt-4o-mini" });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("returns provider status on failure", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = mock.fn(
      async () => new Response('{"error":{"message":"bad key"}}', { status: 401 }),
    ) as typeof fetch;
    try {
      const result = await probeLlmConnection({ apiKey: "sk-bad" });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.match(result.error, /401/);
        assert.match(result.error, /bad key/);
      }
    } finally {
      globalThis.fetch = original;
    }
  });
});
