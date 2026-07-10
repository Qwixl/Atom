/**
 * Live multi-model tool-judgment eval (manual / pre-release — not CI).
 *
 * Usage:
 *   LLM_API_KEY=... pnpm --filter @qwixl/agent-llm eval:tools
 *   EVAL_MODELS=gpt-4o-mini,gpt-4.1-mini pnpm --filter @qwixl/agent-llm eval:tools
 */

import { Catalog, registerCorePrimitives, type AgentOutput } from "@qwixl/shell-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LlmAgentSession } from "../src/LlmAgentSession.js";
import type { AtomConnectorId, AtomConnectorInvokeInput } from "../src/toolRegistry.js";
import { TOOL_EVAL_SCENARIOS } from "./scenarios.js";
import { formatEvalReport, scoreScenario, type RecordedToolCall, type ScenarioScore } from "./scorer.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runScenario(
  model: string,
  apiKey: string,
  baseUrl: string,
  scenario: (typeof TOOL_EVAL_SCENARIOS)[number],
): Promise<ScenarioScore> {
  const catalog = new Catalog();
  registerCorePrimitives(catalog);
  const recorded: RecordedToolCall[] = [];
  let finalText = "";

  // LlmAgentSession resolves registry names to wire shape before the executor
  // runs, so we map wire back to the canonical tool name for scoring.
  const session = new LlmAgentSession(
    { baseUrl, apiKey, model, temperature: 0 },
    catalog,
    () => ({
      open: [],
      guardedCategories: [],
      calendarContext: scenario.calendarContext,
      rssContext: scenario.rssContext,
    }),
    {
      atomToolExecutor: async (call: AtomConnectorInvokeInput) => {
        recorded.push({
          name: wireToLikelyToolName(call),
          arguments: JSON.stringify(call.input ?? {}),
        });
        return { ok: true, stub: true, connectorId: call.connectorId, operation: call.operation };
      },
      atomConnectorsAvailable: true,
      connectedConnectorIds: scenario.connectedConnectorIds as AtomConnectorId[] | undefined,
      // Neutral profile — do not apply tool-shy/eager addenda during categorization.
      forceBehaviorClassId: "balanced",
    },
  );

  const done = new Promise<void>((resolve) => {
    session.subscribe((output: AgentOutput) => {
      if (output.type === "text") {
        finalText += (finalText ? "\n" : "") + output.text;
      } else if (output.type === "composition") {
        finalText += `\n${JSON.stringify(output.composition)}`;
      } else if (output.type === "consequential-action") {
        finalText += `\n${JSON.stringify(output)}`;
      } else if (output.type === "done") {
        resolve();
      }
    });
  });

  session.sendUserMessage(scenario.userMessage);
  await Promise.race([done, sleep(120_000)]);
  session.dispose();

  return scoreScenario(scenario, recorded, finalText);
}

function wireToLikelyToolName(call: AtomConnectorInvokeInput): string {
  const key = `${call.connectorId}:${call.operation}`;
  const map: Record<string, string> = {
    "webcal:listEvents": "calendar_list_events",
    "caldav:listCalendars": "caldav_list_calendars",
    "caldav:listEvents": "caldav_list_events",
    "carddav:listContacts": "contacts_list",
    "rss:listItems": "rss_list_items",
    "rss:listPodcastItems": "rss_list_podcast_items",
    "news-search:searchItems": "news_search",
    "page-fetch:readPage": "page_read",
    "bookmarks:listBookmarks": "bookmarks_list",
    "bookmarks:readBookmark": "bookmarks_read",
    "todoist:listTasks": "todoist_list_tasks",
    "todoist:listProjects": "todoist_list_projects",
    "github:listNotifications": "github_list_notifications",
    "github:listAssignedIssues": "github_list_assigned_issues",
    "notion:search": "notion_search",
    "linear:listAssignedIssues": "linear_list_assigned_issues",
    "trello:listBoards": "trello_list_boards",
    "trello:listCards": "trello_list_cards",
    "home-assistant:listEntities": "home_assistant_list_entities",
    "home-assistant:getEntityState": "home_assistant_get_entity_state",
    "bluesky:listTimeline": "bluesky_list_timeline",
    "bluesky:listNotifications": "bluesky_list_notifications",
    "mastodon:listHomeTimeline": "mastodon_list_home_timeline",
    "mastodon:listNotifications": "mastodon_list_notifications",
    "weather:getForecast": "weather_get_forecast",
  };
  return map[key] ?? "atom_connector_invoke";
}

async function main(): Promise<void> {
  const apiKey = process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("Set LLM_API_KEY (or OPENAI_API_KEY) to run live tool evals.");
    process.exit(1);
  }
  const baseUrl = process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1";
  // Scoreboard default (Q34 / TJ-2.3): mini for cheap signal + one stronger chat model.
  // Override with EVAL_MODELS=model-a,model-b or LLM_MODEL=single.
  const models = (process.env.EVAL_MODELS ?? "gpt-4o-mini,gpt-4o")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const filter = process.env.EVAL_FILTER?.trim();
  const scenarios = filter
    ? TOOL_EVAL_SCENARIOS.filter((s) => s.id.includes(filter) || s.description.includes(filter))
    : TOOL_EVAL_SCENARIOS;

  const summaries: string[] = [];
  for (const model of models) {
    console.error(`Running ${scenarios.length} scenarios on ${model}…`);
    const scores: ScenarioScore[] = [];
    for (const scenario of scenarios) {
      process.stderr.write(`  ${scenario.id}… `);
      try {
        const score = await runScenario(model, apiKey, baseUrl, scenario);
        scores.push(score);
        console.error(score.pass ? "pass" : `FAIL (${score.failureClass})`);
      } catch (error) {
        scores.push({
          id: scenario.id,
          pass: false,
          failureClass: "protocol-violation",
          detail: error instanceof Error ? error.message : String(error),
          tools: [],
        });
        console.error("ERROR");
      }
      await sleep(500);
    }
    const report = formatEvalReport(model, scores);
    console.log(report);
    const passed = scores.filter((s) => s.pass).length;
    summaries.push(`${model}: ${passed}/${scores.length}`);
  }
  if (summaries.length > 1) {
    console.log("\n# Scoreboard\n\n" + summaries.map((s) => `- ${s}`).join("\n") + "\n");
  }
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  void main();
}
