import type { ToolCallExpectation, ToolEvalScenario } from "./scenarios.js";

export type RecordedToolCall = {
  name: string;
  arguments: string;
};

export type FailureClass =
  | "mis-route"
  | "bad-args"
  | "missing-call"
  | "unexpected-call"
  | "protocol-violation"
  | "settings-missing"
  | "ok";

export type ScenarioScore = {
  id: string;
  pass: boolean;
  failureClass: FailureClass;
  detail: string;
  tools: RecordedToolCall[];
};

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function argsMatch(call: RecordedToolCall, expect: ToolCallExpectation): boolean {
  if (call.name !== expect.name) return false;
  if (!expect.argsIncludes) return true;
  const args = parseArgs(call.arguments);
  for (const [key, want] of Object.entries(expect.argsIncludes)) {
    const got = args[key];
    if (typeof want === "string") {
      if (typeof got !== "string" || !got.toLowerCase().includes(want.toLowerCase())) {
        return false;
      }
    } else if (got !== want) {
      return false;
    }
  }
  return true;
}

function protocolHasSettingsProposal(raw: string): boolean {
  return /settingsProposal["']?\s*:\s*(true|"true")/i.test(raw);
}

function protocolHasBriefingDaily(raw: string): boolean {
  return /briefing-daily/i.test(raw);
}

export function scoreScenario(
  scenario: ToolEvalScenario,
  tools: RecordedToolCall[],
  finalAssistantText: string,
): ScenarioScore {
  if (scenario.expectNoTool && tools.length > 0) {
    return {
      id: scenario.id,
      pass: false,
      failureClass: "unexpected-call",
      detail: `expected no tools, got ${tools.map((t) => t.name).join(", ")}`,
      tools,
    };
  }

  if (scenario.expectAnyTool && scenario.expectAnyTool.length > 0) {
    const hit = scenario.expectAnyTool.some((exp) => tools.some((t) => argsMatch(t, exp)));
    if (!hit) {
      if (scenario.allowNoTool && tools.length === 0) {
        // Honest no-tool answer allowed; continue to protocol checks.
      } else {
        const called = tools.map((t) => t.name).join(", ") || "(none)";
        const wanted = scenario.expectAnyTool.map((e) => e.name).join(" | ");
        const failureClass: FailureClass =
          tools.length === 0
            ? "missing-call"
            : tools.some((t) => scenario.expectAnyTool!.some((e) => e.name === t.name))
              ? "bad-args"
              : "mis-route";
        return {
          id: scenario.id,
          pass: false,
          failureClass,
          detail: `wanted one of [${wanted}], got [${called}]`,
          tools,
        };
      }
    }
  }

  if (scenario.expectSettingsProposal && !protocolHasSettingsProposal(finalAssistantText)) {
    return {
      id: scenario.id,
      pass: false,
      failureClass: "settings-missing",
      detail: "expected settingsProposal consequential-action in final protocol",
      tools,
    };
  }

  if (scenario.forbidBriefingDaily && protocolHasBriefingDaily(finalAssistantText)) {
    return {
      id: scenario.id,
      pass: false,
      failureClass: "protocol-violation",
      detail: "forbidden briefing-daily surface",
      tools,
    };
  }

  return {
    id: scenario.id,
    pass: true,
    failureClass: "ok",
    detail: "pass",
    tools,
  };
}

export function formatEvalReport(
  model: string,
  scores: ScenarioScore[],
): string {
  const passed = scores.filter((s) => s.pass).length;
  const lines = [
    `# Tool judgment eval — ${model}`,
    "",
    `Score: **${passed}/${scores.length}** (${((passed / scores.length) * 100).toFixed(1)}%)`,
    "",
    "| id | pass | class | detail |",
    "|---|---|---|---|",
  ];
  for (const s of scores) {
    lines.push(
      `| ${s.id} | ${s.pass ? "yes" : "no"} | ${s.failureClass} | ${s.detail.replace(/\|/g, "/")} |`,
    );
  }
  const byClass = new Map<string, number>();
  for (const s of scores.filter((x) => !x.pass)) {
    byClass.set(s.failureClass, (byClass.get(s.failureClass) ?? 0) + 1);
  }
  if (byClass.size > 0) {
    lines.push("", "## Failures by class", "");
    for (const [k, v] of [...byClass.entries()].sort()) {
      lines.push(`- ${k}: ${v}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
