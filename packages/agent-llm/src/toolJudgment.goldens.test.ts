import { describe, expect, it } from "vitest";
import { TOOL_EVAL_SCENARIOS } from "../evals/scenarios.js";
import { formatEvalReport, scoreScenario } from "../evals/scorer.js";
import { buildSystemPrompt } from "./prompt.js";
import { Catalog, registerCorePrimitives } from "@qwixl/shell-core";
import { buildAgentToolProfile, chatCompletionTools } from "./agentTools.js";
import { ATOM_TOOL_REGISTRY, resolveToolCallToConnectorInvoke } from "./toolRegistry.js";

describe("tool judgment CI goldens", () => {
  it("keeps registry under mis-routing threshold", () => {
    expect(ATOM_TOOL_REGISTRY.length).toBeLessThanOrEqual(30);
  });

  it("prompt includes Choosing tools section", () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);
    const prompt = buildSystemPrompt(catalog, { open: [], guardedCategories: [] });
    expect(prompt).toContain("## Choosing tools and actions");
    expect(prompt).toContain("When NOT to call tools");
    expect(prompt).toContain("Owner connector tools");
    expect(prompt).toContain("todoist_list_tasks");
    expect(prompt).toContain("empty or loading Calendar/RSS snapshot");
    expect(prompt).toContain("Anti-patterns");
    expect(prompt).toContain("linear_list_assigned_issues");
    expect(prompt).toContain("page_read");
  });

  it("chat tools include registry names and deprecated alias", () => {
    const profile = buildAgentToolProfile(undefined, { atomConnectorsAvailable: true });
    const tools = chatCompletionTools(profile) as Array<{ function?: { name?: string } }>;
    const names = new Set(tools.map((t) => t.function?.name));
    expect(names.has("news_search")).toBe(true);
    expect(names.has("page_read")).toBe(true);
    expect(names.has("atom_connector_invoke")).toBe(true);
  });

  it("name→wire resolution goldens", () => {
    expect(
      resolveToolCallToConnectorInvoke("news_search", JSON.stringify({ query: "x" })),
    ).toMatchObject({
      ok: true,
      call: { connectorId: "news-search", operation: "searchItems" },
    });
    expect(
      resolveToolCallToConnectorInvoke(
        "atom_connector_invoke",
        JSON.stringify({ connectorId: "rss", operation: "listItems" }),
      ),
    ).toMatchObject({ ok: true, call: { connectorId: "rss", operation: "listItems" } });
  });

  it("scorer detects missing tool and settings proposal", () => {
    const scenario = TOOL_EVAL_SCENARIOS.find((s) => s.id === "news-search-topic")!;
    const miss = scoreScenario(scenario, [], "just text");
    expect(miss.pass).toBe(false);
    expect(miss.failureClass).toBe("missing-call");

    const settings = TOOL_EVAL_SCENARIOS.find((s) => s.id === "settings-soft-confirm-xrp")!;
    const noProposal = scoreScenario(
      settings,
      [{ name: "news_search", arguments: JSON.stringify({ query: "XRP" }) }],
      JSON.stringify({ messages: [{ type: "text", text: "I'll set that up" }] }),
    );
    expect(noProposal.pass).toBe(false);
    expect(noProposal.failureClass).toBe("settings-missing");

    const allowNone = scoreScenario(
      settings,
      [],
      JSON.stringify({
        messages: [
          { type: "text", text: "ok" },
          {
            type: "consequential-action",
            action: { terms: { settingsProposal: true } },
          },
        ],
      }),
    );
    expect(allowNone.pass).toBe(true);
  });

  it("formatEvalReport aggregates", () => {
    const report = formatEvalReport("test-model", [
      {
        id: "a",
        pass: true,
        failureClass: "ok",
        detail: "pass",
        tools: [],
      },
      {
        id: "b",
        pass: false,
        failureClass: "mis-route",
        detail: "wrong",
        tools: [],
      },
    ]);
    expect(report).toContain("1/2");
    expect(report).toContain("mis-route");
  });

  it("scenario set covers known failure modes", () => {
    const ids = new Set(TOOL_EVAL_SCENARIOS.map((s) => s.id));
    expect(ids.has("calendar-fresh")).toBe(true);
    expect(ids.has("page-read-link-intent")).toBe(true);
    expect(ids.has("settings-soft-confirm-xrp")).toBe(true);
    expect(ids.has("unsolicited-briefing-forbidden")).toBe(true);
    expect(TOOL_EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(25);
  });
});
