import { describe, expect, it } from "vitest";
import {
  listBehaviorClassIds,
  proposeClassFromFailureCounts,
  resolveModelBehavior,
  MODEL_BEHAVIOR_REGISTRY,
  type ModelBehaviorRegistry,
} from "./modelBehavior.js";
import { buildAgentToolProfile, chatCompletionTools } from "./agentTools.js";
import { buildSystemPrompt } from "./prompt.js";
import { Catalog, registerCorePrimitives } from "@qwixl/shell-core";

/** Fixture registry — unit tests must not depend on live ops assignments. */
const FIXTURE_REGISTRY: ModelBehaviorRegistry = {
  schemaVersion: 1,
  updated: "test",
  defaultClassId: "balanced",
  classes: MODEL_BEHAVIOR_REGISTRY.classes,
  assignments: [
    { pattern: "gpt-4o-mini", classId: "tool-eager" },
    { pattern: "gpt-4o", classId: "tool-shy" },
    { pattern: "llama", classId: "local-slm" },
  ],
};

describe("model behavior classes", () => {
  it("defines four ops classes", () => {
    expect(listBehaviorClassIds().sort()).toEqual(
      ["balanced", "local-slm", "tool-eager", "tool-shy"].sort(),
    );
  });

  it("matches gpt-4o-mini before gpt-4o (longer pattern)", () => {
    expect(resolveModelBehavior("gpt-4o-mini", FIXTURE_REGISTRY).classId).toBe("tool-eager");
    expect(resolveModelBehavior("openai/gpt-4o", FIXTURE_REGISTRY).classId).toBe("tool-shy");
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

  it("tool-shy injects invoke addendum into system prompt", () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);
    const behavior = resolveModelBehavior("gpt-4o", FIXTURE_REGISTRY);
    const profile = {
      ...buildAgentToolProfile(undefined, { atomConnectorsAvailable: true, model: "gpt-4o" }),
      behaviorClassId: behavior.classId,
      promptAddendum: behavior.promptAddendum || undefined,
      includeDeprecatedAlias: behavior.includeDeprecatedAlias,
      toolChoice: behavior.toolChoice,
    };
    const prompt = buildSystemPrompt(catalog, { open: [], guardedCategories: [] }, profile);
    expect(prompt).toContain("tool-shy profile");
    expect(prompt).toContain("MUST call the matching intent-named tool");
  });

  it("tool-eager addendum requires settingsProposal on soft-confirm", () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);
    const behavior = resolveModelBehavior("gpt-4o-mini", FIXTURE_REGISTRY);
    expect(behavior.classId).toBe("tool-eager");
    const profile = {
      ...buildAgentToolProfile(undefined, {
        atomConnectorsAvailable: true,
        model: "gpt-4o-mini",
      }),
      behaviorClassId: behavior.classId,
      promptAddendum: behavior.promptAddendum || undefined,
      includeDeprecatedAlias: behavior.includeDeprecatedAlias,
      toolChoice: behavior.toolChoice,
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

  it("proposeClassFromFailureCounts returns null when inconclusive", () => {
    expect(
      proposeClassFromFailureCounts({
        missingCall: 0,
        unexpectedCall: 0,
        settingsMissing: 0,
        misRoute: 0,
        toolScenarioCount: 20,
      }),
    ).toBeNull();
  });

  it("registry JSON stays secret-free", () => {
    const blob = JSON.stringify(MODEL_BEHAVIOR_REGISTRY);
    expect(blob).not.toMatch(/sk-[a-zA-Z0-9]{10,}|api[_-]?key\s*[:=]/i);
  });
});
