import { describe, expect, it } from "vitest";
import { resolveHostedSignupFields } from "./hostedSignupLock.js";

describe("resolveHostedSignupFields", () => {
  it("requires OpenRouter base URL and model when provider is openrouter", () => {
    const fields = resolveHostedSignupFields({
      email: "a@b.co",
      handle: "@you",
      llmApiKey: "sk-or-v1-x",
      llmProvider: "openrouter",
      llmModel: "anthropic/claude-sonnet-4",
    });
    expect(fields).toEqual({
      email: "a@b.co",
      handle: "@you",
      llmApiKey: "sk-or-v1-x",
      llmProvider: "openrouter",
      llmBaseUrl: "https://openrouter.ai/api/v1",
      llmModel: "anthropic/claude-sonnet-4",
    });
  });

  it("defaults OpenAI base URL and model", () => {
    expect(
      resolveHostedSignupFields({
        email: "a@b.co",
        handle: "@you",
        llmApiKey: "sk-x",
      }),
    ).toEqual({
      email: "a@b.co",
      handle: "@you",
      llmApiKey: "sk-x",
      llmProvider: "openai",
      llmBaseUrl: "https://api.openai.com/v1",
      llmModel: "gpt-4o-mini",
    });
  });

  it("rejects custom provider without base URL", () => {
    expect(
      resolveHostedSignupFields({
        email: "a@b.co",
        handle: "@you",
        llmApiKey: "sk-x",
        llmProvider: "custom",
        llmBaseUrl: "",
        llmModel: "foo",
      }),
    ).toBeNull();
  });
});
