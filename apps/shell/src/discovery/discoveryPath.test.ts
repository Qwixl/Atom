import { describe, expect, it } from "vitest";
import {
  appendDiscoveryStep,
  closeDiscoveryPath,
  ensureActiveDiscoveryPath,
  enrichLinkIntentPayload,
  formatDiscoveryPathForPrompt,
  listDiscoveryHistory,
  removeDiscoveryPath,
  truncateDiscoveryPathToStep,
} from "./discoveryPath.js";

describe("discoveryPath", () => {
  it("creates a path and appends link-intent steps", () => {
    const first = appendDiscoveryStep([], null, {
      url: "https://example.com/a",
      title: "EU AI Act draft",
      intent: "summarize",
    });
    expect(first.path.steps).toHaveLength(1);
    expect(first.path.label).toBe("EU AI Act draft");
    expect(first.step.parentStepId).toBeUndefined();

    const second = appendDiscoveryStep(first.paths, first.path.id, {
      url: "https://example.com/b",
      title: "Related policy",
      intent: "explore",
    });
    expect(second.path.steps).toHaveLength(2);
    expect(second.step.parentStepId).toBe(first.step.id);
  });

  it("reuses active path when id matches", () => {
    const seeded = ensureActiveDiscoveryPath([], null, "Seed");
    const appended = appendDiscoveryStep(seeded.paths, seeded.path.id, {
      url: "https://example.com/c",
      title: "Story",
      intent: "full",
    });
    expect(appended.path.id).toBe(seeded.path.id);
  });

  it("formats prompt context with current step marker", () => {
    const { path, step } = appendDiscoveryStep([], null, {
      url: "https://example.com/a",
      title: "Headline",
      intent: "summarize",
    });
    const text = formatDiscoveryPathForPrompt(path);
    expect(text).toContain('Active discovery path "Headline"');
    expect(text).toContain("(current)");
    expect(
      enrichLinkIntentPayload(
        { url: "https://example.com/a", title: "Headline", intent: "summarize" },
        path,
        step,
      ).stepIndex,
    ).toBe(0);
  });

  it("removes a path from history without affecting others", () => {
    const a = appendDiscoveryStep([], null, {
      url: "https://example.com/a",
      title: "A",
      intent: "summarize",
    });
    const b = appendDiscoveryStep([], null, {
      url: "https://example.com/b",
      title: "B",
      intent: "explore",
    });
    const merged = [...a.paths, b.path];
    const next = removeDiscoveryPath(merged, b.path.id);
    expect(next.some((path) => path.id === a.path.id)).toBe(true);
    expect(next.some((path) => path.id === b.path.id)).toBe(false);
    expect(closeDiscoveryPath(merged, b.path.id)).toEqual(next);
  });

  it("truncates to an earlier hop", () => {
    const first = appendDiscoveryStep([], null, {
      url: "https://example.com/a",
      title: "A",
      intent: "summarize",
    });
    const second = appendDiscoveryStep(first.paths, first.path.id, {
      url: "https://example.com/b",
      title: "B",
      intent: "explore",
    });
    const truncated = truncateDiscoveryPathToStep(second.paths, second.path.id, first.step.id);
    expect(truncated?.path.steps).toHaveLength(1);
    expect(truncated?.step.id).toBe(first.step.id);
  });

  it("lists discovery history newest-first", () => {
    const older = appendDiscoveryStep([], null, {
      url: "https://example.com/old",
      title: "Old",
      intent: "summarize",
    });
    const newer = appendDiscoveryStep([], null, {
      url: "https://example.com/new",
      title: "New",
      intent: "explore",
    });
    // Force distinct activity timestamps (append uses Date.now).
    older.path.steps[0]!.at = 1;
    newer.path.steps[0]!.at = 2;
    const history = listDiscoveryHistory([older.path, newer.path]);
    expect(history[0]?.label).toBe("New");
  });
});
