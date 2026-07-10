import { describe, expect, it } from "vitest";
import {
  listBehaviorClassIds,
  proposeClassFromFailureCounts,
  resolveModelBehavior,
  resolveBehaviorClass,
  isModelAssessed,
  MODEL_BEHAVIOR_REGISTRY,
  type ModelBehaviorRegistry,
} from "./modelBehavior.js";
import { parseModelIdentity } from "./modelIdentity.js";
import { buildAgentToolProfile, chatCompletionTools } from "./agentTools.js";
import { buildSystemPrompt } from "./prompt.js";
import { Catalog, registerCorePrimitives } from "@qwixl/shell-core";

/** Fixture registry — unit tests must not depend on live ops assignments. */
const FIXTURE_REGISTRY: ModelBehaviorRegistry = {
  schemaVersion: 2,
  updated: "test",
  defaultClassId: "balanced",
  classes: MODEL_BEHAVIOR_REGISTRY.classes,
  assignments: [
    {
      kind: "exact",
      pattern: "gpt-4o-mini",
      classId: "tool-eager",
      evalBaseline: {
        hash: "test-hash",
        scoredAt: "2026-07-10",
        modelId: "openai/gpt-4o-mini",
      },
    },
    { kind: "family", pattern: "gpt-4o", classId: "tool-shy" },
    { kind: "family", pattern: "llama", classId: "local-slm" },
  ],
};

describe("model behavior classes", () => {
  it("defines four ops classes", () => {
    expect(listBehaviorClassIds().sort()).toEqual(
      ["balanced", "local-slm", "tool-eager", "tool-shy"].sort(),
    );
  });

  it("prefers exact bare id over family substring", () => {
    expect(resolveModelBehavior("openai/gpt-4o-mini", FIXTURE_REGISTRY).classId).toBe(
      "tool-eager",
    );
    expect(resolveModelBehavior("openai/gpt-4o-mini", FIXTURE_REGISTRY).matchedKind).toBe(
      "exact",
    );
    expect(resolveModelBehavior("openai/gpt-4o", FIXTURE_REGISTRY).classId).toBe("tool-shy");
    expect(resolveModelBehavior("openai/gpt-4o", FIXTURE_REGISTRY).matchedKind).toBe("family");
  });

  it("defaults unknown models to balanced", () => {
    expect(resolveModelBehavior("totally-unknown-xyz", FIXTURE_REGISTRY).classId).toBe(
      "balanced",
    );
  });

  it("matches broadened family seeds", () => {
    expect(resolveModelBehavior("deepseek-chat").classId).toBe("balanced");
    expect(resolveModelBehavior("google/gemini-2.0-flash").classId).toBe("balanced");
    expect(resolveModelBehavior("x-ai/grok-3").classId).toBe("balanced");
  });

  it("isModelAssessed requires exact; hash optional for queue skip", () => {
    expect(isModelAssessed("gpt-4o-mini", undefined, FIXTURE_REGISTRY)).toBe(true);
    expect(isModelAssessed("gpt-4o-mini", "test-hash", FIXTURE_REGISTRY)).toBe(true);
    expect(isModelAssessed("gpt-4o-mini", "other-hash", FIXTURE_REGISTRY)).toBe(false);
    expect(isModelAssessed("gpt-4o", "test-hash", FIXTURE_REGISTRY)).toBe(false);
  });

  it("parseModelIdentity strips provider prefix", () => {
    expect(parseModelIdentity("openai/gpt-4o-mini")).toEqual({
      raw: "openai/gpt-4o-mini",
      providerPrefix: "openai",
      bare: "gpt-4o-mini",
      normalized: "gpt-4o-mini",
    });
  });

  it("local-slm omits deprecated alias from chat tools", () => {
    const profile = buildAgentToolProfile(undefined, {
      atomConnectorsAvailable: true,
      model: "llama-3.1-8b",
    });
    expect(profile.behaviorClassId).toBe("local-slm");
    expect(profile.includeDeprecatedAlias).toBe(false);
    const tools = chatCompletionTools(profile) as Array<{ function?: { name?: string } }>;
    const names = tools.map((t) => t.function?.name);
    expect(names).not.toContain("atom_connector_invoke");
    expect(names).toContain("news_search");
  });

  it("forceBehaviorClassId balanced omits addendum", () => {
    const profile = buildAgentToolProfile(undefined, {
      atomConnectorsAvailable: true,
      model: "gpt-4o",
      forceBehaviorClassId: "balanced",
    });
    expect(profile.behaviorClassId).toBe("balanced");
    expect(profile.promptAddendum).toBeUndefined();
  });

  it("tool-shy injects invoke addendum into system prompt", () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);
    const behavior = resolveBehaviorClass("tool-shy");
    const profile = {
      ...buildAgentToolProfile(undefined, {
        atomConnectorsAvailable: true,
        forceBehaviorClassId: "tool-shy",
      }),
      behaviorClassId: behavior.classId,
      promptAddendum: behavior.promptAddendum || undefined,
    };
    const prompt = buildSystemPrompt(catalog, { open: [], guardedCategories: [] }, profile);
    expect(prompt).toContain("tool-shy profile");
    expect(prompt).toContain("MUST call the matching intent-named tool");
  });

  it("tool-eager addendum requires settingsProposal on soft-confirm", () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);
    const behavior = resolveBehaviorClass("tool-eager");
    expect(behavior.classId).toBe("tool-eager");
    const profile = {
      ...buildAgentToolProfile(undefined, {
        atomConnectorsAvailable: true,
        forceBehaviorClassId: "tool-eager",
      }),
      behaviorClassId: behavior.classId,
      promptAddendum: behavior.promptAddendum || undefined,
    };
    const prompt = buildSystemPrompt(catalog, { open: [], guardedCategories: [] }, profile);
    expect(prompt).toContain("settingsProposal");
    expect(prompt).toMatch(/Soft-confirm track\/alert/);
  });

  it("proposeClassFromFailureCounts maps missing-call dominance to tool-shy", () => {
    expect(
      proposeClassFromFailureCounts({
        missingCall: 12,
        unexpectedCall: 0,
        settingsMissing: 1,
        misRoute: 0,
        toolScenarioCount: 20,
      }),
    ).toBe("tool-shy");
  });

  it("proposeClassFromFailureCounts maps clean scoreboard to balanced", () => {
    expect(
      proposeClassFromFailureCounts({
        missingCall: 0,
        unexpectedCall: 0,
        settingsMissing: 0,
        misRoute: 0,
        toolScenarioCount: 20,
      }),
    ).toBe("balanced");
  });

  it("registry JSON stays secret-free", () => {
    const blob = JSON.stringify(MODEL_BEHAVIOR_REGISTRY);
    expect(blob).not.toMatch(/sk-[a-zA-Z0-9]{10,}|api[_-]?key\s*[:=]/i);
  });

  it("live registry is schema v2 with exact/family kinds", () => {
    expect(MODEL_BEHAVIOR_REGISTRY.schemaVersion).toBe(2);
    expect(MODEL_BEHAVIOR_REGISTRY.assignments.every((a) => a.kind === "exact" || a.kind === "family")).toBe(
      true,
    );
  });
});
