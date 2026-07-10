import { describe, expect, it } from "vitest";
import {
  ATOM_CONNECTOR_INVOKE_ALIAS,
  ATOM_TOOL_REGISTRY,
  getToolRegistryEntry,
  listToolRegistryEntries,
  resolveAgUiConnectorInvoke,
  resolveToolCallToConnectorInvoke,
  validateRegistryToolArgs,
} from "./toolRegistry.js";
import { buildAgentToolProfile, chatCompletionTools, formatToolsForPrompt } from "./agentTools.js";

describe("toolRegistry", () => {
  it("exposes intent-named tools under the mis-routing threshold", () => {
    expect(ATOM_TOOL_REGISTRY.length).toBeGreaterThan(15);
    expect(ATOM_TOOL_REGISTRY.length).toBeLessThanOrEqual(30);
    expect(getToolRegistryEntry("news_search")?.connectorId).toBe("news-search");
    expect(getToolRegistryEntry("page_read")?.operation).toBe("readPage");
    expect(getToolRegistryEntry("calendar_list_events")?.connectorId).toBe("webcal");
  });

  it("filters by connected connectors while keeping always-available tools", () => {
    const filtered = listToolRegistryEntries({ connectedConnectorIds: ["webcal", "rss"] });
    const names = filtered.map((e) => e.name);
    expect(names).toContain("calendar_list_events");
    expect(names).toContain("rss_list_items");
    expect(names).toContain("news_search");
    expect(names).toContain("page_read");
    expect(names).toContain("weather_get_forecast");
    expect(names).not.toContain("todoist_list_tasks");
    expect(names).not.toContain("github_list_notifications");
  });

  it("resolves registry tool calls to connector wire shape", () => {
    const ok = resolveToolCallToConnectorInvoke(
      "news_search",
      JSON.stringify({ query: "XRP price" }),
    );
    expect(ok).toEqual({
      ok: true,
      call: {
        connectorId: "news-search",
        operation: "searchItems",
        input: { query: "XRP price" },
      },
    });
  });

  it("validates required args with readable errors", () => {
    const entry = getToolRegistryEntry("page_read")!;
    expect(validateRegistryToolArgs(entry, {})).toEqual({
      ok: false,
      error: expect.stringContaining("missing `url`"),
    });
    expect(validateRegistryToolArgs(entry, { url: "http://insecure.example" }).ok).toBe(false);
    expect(validateRegistryToolArgs(entry, { url: "https://example.com/a" }).ok).toBe(true);
  });

  it("accepts deprecated atom_connector_invoke alias", () => {
    const ok = resolveToolCallToConnectorInvoke(
      ATOM_CONNECTOR_INVOKE_ALIAS,
      JSON.stringify({
        connectorId: "webcal",
        operation: "listEvents",
      }),
    );
    expect(ok).toEqual({
      ok: true,
      call: { connectorId: "webcal", operation: "listEvents", input: undefined },
    });
  });

  it("resolves AG-UI payloads with toolName or legacy fields", () => {
    expect(
      resolveAgUiConnectorInvoke({
        toolName: "page_read",
        input: { url: "https://example.com/x" },
      }),
    ).toMatchObject({
      ok: true,
      call: { connectorId: "page-fetch", operation: "readPage" },
    });
    expect(
      resolveAgUiConnectorInvoke({
        connectorId: "rss",
        operation: "listItems",
      }),
    ).toMatchObject({
      ok: true,
      call: { connectorId: "rss", operation: "listItems" },
    });
  });

  it("emits registry tools from chatCompletionTools", () => {
    const profile = buildAgentToolProfile(undefined, {
      atomConnectorsAvailable: true,
      connectedConnectorIds: ["webcal"],
    });
    const tools = chatCompletionTools(profile) as Array<{
      function?: { name: string };
    }>;
    const names = tools.map((t) => t.function?.name).filter(Boolean);
    expect(names).toContain("calendar_list_events");
    expect(names).toContain("news_search");
    expect(names).toContain(ATOM_CONNECTOR_INVOKE_ALIAS);
    expect(names).not.toContain("todoist_list_tasks");

    const prompt = formatToolsForPrompt(profile);
    expect(prompt).toContain("calendar_list_events");
    expect(prompt).toContain("news_search");
  });
});
