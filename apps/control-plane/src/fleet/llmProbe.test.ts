import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { isAnthropicBaseUrl, probeLlmConnection } from "./llmProbe.js";

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

  it("probes Anthropic Messages API with x-api-key", async () => {
    const original = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const result = await probeLlmConnection({
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514",
      });
      assert.deepEqual(result, { ok: true, model: "claude-sonnet-4-20250514" });
      assert.equal(calls.length, 1);
      assert.match(calls[0]!.url, /\/v1\/messages$/);
      const headers = calls[0]!.init?.headers as Record<string, string>;
      assert.equal(headers["x-api-key"], "sk-ant-test");
      assert.ok(!("Authorization" in headers));
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("isAnthropicBaseUrl", () => {
  it("detects Anthropic hosts", () => {
    assert.equal(isAnthropicBaseUrl("https://api.anthropic.com"), true);
    assert.equal(isAnthropicBaseUrl("https://api.openai.com/v1"), false);
  });
});
