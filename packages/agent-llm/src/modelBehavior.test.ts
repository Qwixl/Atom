import { describe, expect, it } from "vitest";
import {
  listBehaviorClassIds,
  proposeClassFromFailureCounts,
  resolveModelBehavior,
  MODEL_BEHAVIOR_REGISTRY,
} from "./modelBehavior.js";
import { buildAgentToolProfile, chatCompletionTools } from "./agentTools.js";
import { buildSystemPrompt } from "./prompt.js";
import { Catalog, registerCorePrimitives } from "@qwixl/shell-core";

describe("model behavior classes", () => {
  it("defines four ops classes", () => {
    expect(listBehaviorClassIds().sort()).toEqual(
      ["balanced", "local-slm", "tool-eager", "tool-shy"].sort(),
    );
  });

  it("matches gpt-4o-mini before gpt-4o (longer pattern)", () => {
    expect(resolveModelBehavior("gpt-4o-mini").classId).toBe("tool-eager");
    expect(resolveModelBehavior("openai/gpt-4o").classId).toBe("tool-shy");
  });

  it("defaults unknown models to balanced", () => {
    expect(resolveModelBehavior("totally-unknown-xyz").classId).toBe("balanced");
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
    const profile = buildAgentToolProfile(undefined, {
      atomConnectorsAvailable: true,
      model: "gpt-4o",
    });
    const prompt = buildSystemPrompt(catalog, { open: [], guardedCategories: [] }, profile);
    expect(prompt).toContain("tool-shy profile");
    expect(prompt).toContain("MUST call the matching intent-named tool");
  });

  it("tool-eager addendum requires settingsProposal on soft-confirm", () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);
    const profile = buildAgentToolProfile(undefined, {
      atomConnectorsAvailable: true,
      model: "gpt-4o-mini",
    });
    expect(profile.behaviorClassId).toBe("tool-eager");
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

  it("registry JSON stays secret-free", () => {
    const blob = JSON.stringify(MODEL_BEHAVIOR_REGISTRY);
    expect(blob).not.toMatch(/sk-[a-zA-Z0-9]{10,}|api[_-]?key\s*[:=]/i);
  });
});
