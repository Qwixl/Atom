import { describe, expect, it } from "vitest";
import type { DiscoveryPath } from "./discoveryPath.js";
import {
  detectPathIntersection,
  markIntersectionDismissed,
  mergeDiscoveryPaths,
  PATH_INTERSECTION_MIN_CONFIDENCE,
  scorePathIntersection,
} from "./pathIntersection.js";

function path(
  id: string,
  label: string,
  steps: Array<{ url: string; title: string }>,
): DiscoveryPath {
  return {
    id,
    label,
    startedAt: 1,
    themes: [],
    steps: steps.map((step, index) => ({
      id: `${id}-s${index}`,
      url: step.url,
      title: step.title,
      intent: "explore",
      at: index + 1,
    })),
  };
}

describe("pathIntersection", () => {
  it("detects high-confidence shared domain + theme overlap", () => {
    const active = path("a", "Jordan Henderson injury", [
      {
        url: "https://bbc.co.uk/sport/football/henderson",
        title: "Jordan Henderson injury update",
      },
    ]);
    const related = path("b", "England midfield news", [
      {
        url: "https://bbc.co.uk/sport/football/england",
        title: "Jordan Henderson England squad",
      },
    ]);
    const hit = scorePathIntersection(active, related);
    expect(hit).not.toBeNull();
    expect(hit!.confidence).toBeGreaterThanOrEqual(PATH_INTERSECTION_MIN_CONFIDENCE);
    expect(hit!.sharedDomains).toContain("bbc.co.uk");
  });

  it("skips low-overlap pairs (continuation preferred)", () => {
    const active = path("a", "Weather outlook", [
      { url: "https://example.com/weather", title: "Today weather forecast" },
    ]);
    const related = path("b", "AI regulation", [
      { url: "https://other.example.org/ai-act", title: "EU AI Act draft" },
    ]);
    expect(scorePathIntersection(active, related)).toBeNull();
  });

  it("respects dismissed pairs", () => {
    const active = path("a", "Jordan Henderson injury", [
      {
        url: "https://bbc.co.uk/sport/football/henderson",
        title: "Jordan Henderson injury update",
      },
    ]);
    const related = path("b", "England midfield news", [
      {
        url: "https://bbc.co.uk/sport/football/england",
        title: "Jordan Henderson England squad",
      },
    ]);
    const dismissed = markIntersectionDismissed(new Set(), "a", "b");
    expect(detectPathIntersection(active, [active, related], dismissed)).toBeNull();
  });

  it("merges related steps onto active and drops related path", () => {
    const active = path("a", "A", [
      { url: "https://example.com/1", title: "One" },
    ]);
    const related = path("b", "B", [
      { url: "https://example.com/1", title: "One" },
      { url: "https://example.com/2", title: "Two" },
    ]);
    const merged = mergeDiscoveryPaths([active, related], "a", "b");
    expect(merged).toHaveLength(1);
    expect(merged[0]?.steps).toHaveLength(2);
    expect(merged[0]?.themes).toContain("B");
  });
});
