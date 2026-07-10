import { describe, expect, it } from "vitest";
import {
  emptySightingsFile,
  mergeSighting,
  serializeSightings,
} from "../src/modelSightings.js";
import {
  resolveEvalCandidates,
  resolveEvalModelShortlist,
} from "./adminModelBehavior.js";
import type { ModelBehaviorRegistry } from "../src/modelBehavior.js";
import { MODEL_BEHAVIOR_REGISTRY } from "../src/modelBehavior.js";

const FIXTURE: ModelBehaviorRegistry = {
  schemaVersion: 2,
  updated: "test",
  defaultClassId: "balanced",
  classes: MODEL_BEHAVIOR_REGISTRY.classes,
  assignments: [
    {
      kind: "exact",
      pattern: "gpt-4o",
      classId: "tool-shy",
      evalBaseline: { hash: "abc", scoredAt: "2026-07-10", modelId: "gpt-4o" },
    },
    { kind: "family", pattern: "claude", classId: "balanced" },
  ],
};

describe("adminModelBehavior first-use shortlist", () => {
  it("skips exact assessments matching baseline; keeps family-only models", () => {
    let file = emptySightingsFile();
    file = mergeSighting(file, "gpt-4o", "import");
    file = mergeSighting(file, "anthropic/claude-sonnet-4", "import");
    const { candidates, skippedAssessed } = resolveEvalCandidates({
      env: {},
      registry: FIXTURE,
      baselineHash: "abc",
      sightings: file,
      includeBootstrap: false,
    });
    expect(skippedAssessed).toContain("gpt-4o");
    expect(candidates.map((c) => c.modelId)).toEqual(["anthropic/claude-sonnet-4"]);
  });

  it("EVAL_MODELS overrides entirely", () => {
    let file = emptySightingsFile();
    file = mergeSighting(file, "deepseek-chat", "import");
    const { models, fromSightings } = resolveEvalModelShortlist(
      { EVAL_MODELS: "claude-sonnet-4" },
      file,
    );
    expect(models).toEqual(["claude-sonnet-4"]);
    expect(fromSightings).toEqual([]);
  });

  it("merges queue pending with local sightings", () => {
    const { candidates } = resolveEvalCandidates({
      env: {},
      registry: FIXTURE,
      baselineHash: "abc",
      includeBootstrap: false,
      pendingQueue: [{ id: "q1", modelId: "deepseek/deepseek-chat", mergeKey: "deepseek-chat" }],
      sightings: mergeSighting(emptySightingsFile(), "x-ai/grok-3", "import"),
    });
    const ids = candidates.map((c) => c.modelId);
    expect(ids).toContain("deepseek/deepseek-chat");
    expect(ids).toContain("x-ai/grok-3");
    expect(candidates.find((c) => c.modelId.startsWith("deepseek"))?.queueId).toBe("q1");
  });

  it("serializeSightings is valid JSON for hand-export", () => {
    const file = mergeSighting(emptySightingsFile(), "grok-3", "shell");
    expect(() => JSON.parse(serializeSightings(file))).not.toThrow();
  });
});
