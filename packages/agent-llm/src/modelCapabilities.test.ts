import { describe, expect, it } from "vitest";
import { shouldCurateTranscript } from "./curator.js";
import {
  buildAgentToolProfile,
  formatToolsForPrompt,
  parseAtomConnectorInvokeArgs,
} from "./agentTools.js";
import {
  formatNativeToolsLabel,
  inferModelCapabilities,
  inferModelFamily,
  inferNativeTools,
  inferProviderKind,
  isNanoChatModel,
} from "./modelCapabilities.js";

describe("modelCapabilities", () => {
  it("detects OpenAI provider", () => {
    expect(inferProviderKind("https://api.openai.com/v1")).toBe("openai");
  });

  it("does not heuristic web_search for gpt-4.1-mini (probe-only)", () => {
    expect(inferNativeTools("gpt-4.1-mini", "openai", "chat")).toEqual([]);
  });

  it("does not heuristic web_search for gpt-4.1-nano", () => {
    expect(inferNativeTools("gpt-4.1-nano", "openai", "chat")).toEqual([]);
    expect(isNanoChatModel("gpt-4.1-nano")).toBe(true);
  });

  it("does not heuristic file_search or code_interpreter for gpt-5-pro", () => {
    const tools = inferNativeTools("gpt-5-pro", "openai", "chat");
    expect(tools).not.toContain("file_search");
    expect(tools).not.toContain("code_interpreter");
  });

  it("infers image_generation for gpt-image models", () => {
    expect(inferModelFamily("gpt-image-2")).toBe("image");
    expect(inferNativeTools("gpt-image-2", "openai", "image")).toEqual(["image_generation"]);
  });

  it("builds profile without assumed chat tools", () => {
    const profile = inferModelCapabilities("https://api.openai.com/v1", "gpt-4.1-nano");
    expect(profile.nativeTools).toEqual([]);
    expect(profile.responsesApi).toBe(false);
  });

  it("wires image_generation for gpt-image models", () => {
    const profile = inferModelCapabilities("https://api.openai.com/v1", "gpt-image-2");
    expect(profile.providerHostedTools).toEqual(["image_generation"]);
    expect(profile.responsesApi).toBe(true);
  });
});

describe("agentTools", () => {
  it("uses Chat Completions for chat models even when metadata lists hosted tools", () => {
    const profile = buildAgentToolProfile(
      {
        ...inferModelCapabilities("https://api.openai.com/v1", "gpt-4.1-mini"),
        nativeTools: ["web_search", "code_interpreter"],
        providerHostedTools: ["web_search", "code_interpreter"],
        responsesApi: true,
      },
      { atomConnectorsAvailable: true },
    );
    expect(profile.useResponsesApi).toBe(false);
    expect(profile.useAtomToolLoop).toBe(true);
  });

  it("uses Responses API for image-family models", () => {
    const profile = buildAgentToolProfile(
      inferModelCapabilities("https://api.openai.com/v1", "gpt-image-2"),
      { atomConnectorsAvailable: false },
    );
    expect(profile.useResponsesApi).toBe(true);
  });

  it("prompt lists only wired tools", () => {
    const profile = buildAgentToolProfile(
      {
        ...inferModelCapabilities("https://api.openai.com/v1", "gpt-4.1-mini"),
        nativeTools: ["web_search"],
        providerHostedTools: ["web_search"],
        responsesApi: true,
      },
      { atomConnectorsAvailable: true },
    );
    const section = formatToolsForPrompt(profile);
    expect(section).not.toContain("web_search");
    expect(section).toContain("atom_connector_invoke");
  });

  it("formats native tools label from profile", () => {
    expect(
      formatNativeToolsLabel({
        nativeTools: ["web_search"],
        providerHostedTools: ["web_search"],
        providerFeatures: [],
      }),
    ).toBe("web_search");
  });

  it("parses connector invoke args", () => {
    const call = parseAtomConnectorInvokeArgs(
      JSON.stringify({ connectorId: "news-search", operation: "searchItems", input: { query: "politics" } }),
    );
    expect(call.connectorId).toBe("news-search");
  });
});

describe("shouldCurateTranscript", () => {
  it("skips news lookup turns", () => {
    expect(
      shouldCurateTranscript([
        { role: "user", text: "what happened with nigel farage today?" },
        { role: "assistant", text: "He resigned..." },
      ]),
    ).toBe(false);
  });

  it("runs when owner discloses preference", () => {
    expect(
      shouldCurateTranscript([
        { role: "user", text: "I prefer aisle seats on long flights" },
        { role: "assistant", text: "Noted." },
      ]),
    ).toBe(true);
  });
});
