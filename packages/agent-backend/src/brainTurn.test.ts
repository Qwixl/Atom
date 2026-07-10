import { describe, expect, it, vi } from "vitest";
import {
  aggregateWorkerResults,
  planBrainWorkers,
  runBrainTurn,
} from "./brainTurn.js";
import type { StandingIntent } from "./standingIntents.js";

function intent(overrides: Partial<StandingIntent> & Pick<StandingIntent, "kind" | "title">): StandingIntent {
  return {
    id: "intent_1",
    enabled: true,
    trigger: { type: "interval", everyMinutes: 30 },
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("planBrainWorkers", () => {
  it("returns no workers for reminders", () => {
    expect(planBrainWorkers(intent({ kind: "reminder", title: "Call" }))).toEqual([]);
  });

  it("plans calendar + feed workers for daily briefing", () => {
    const tasks = planBrainWorkers(intent({ kind: "daily-briefing", title: "Morning" }));
    expect(tasks.map((t) => t.id)).toEqual(["calendar", "feeds"]);
  });

  it("fans out topic workers up to 3", () => {
    const tasks = planBrainWorkers(
      intent({
        kind: "daily-briefing",
        title: "Morning",
        scope: { topics: ["a", "b", "c", "d"] },
      }),
    );
    expect(tasks).toHaveLength(4); // calendar + 3 topics
    expect(tasks.filter((t) => t.id.startsWith("topic:")).map((t) => t.id)).toEqual([
      "topic:a",
      "topic:b",
      "topic:c",
    ]);
  });

  it("fans out watch per connector", () => {
    const tasks = planBrainWorkers(
      intent({
        kind: "watch",
        title: "Cal",
        scope: { query: "conflicts", connectorIds: ["webcal", "caldav"] },
      }),
    );
    expect(tasks.map((t) => t.id)).toEqual(["watch:webcal", "watch:caldav"]);
  });
});

describe("aggregateWorkerResults", () => {
  it("returns null when empty", () => {
    expect(aggregateWorkerResults(intent({ kind: "watch", title: "W" }), [])).toBeNull();
  });

  it("returns single part as-is", () => {
    expect(aggregateWorkerResults(intent({ kind: "watch", title: "W" }), ["Only one"])).toBe(
      "Only one",
    );
  });

  it("bullets multiple parts under title", () => {
    const out = aggregateWorkerResults(intent({ kind: "daily-briefing", title: "Morning" }), [
      "Cal ok",
      "News ok",
    ]);
    expect(out).toContain("Morning");
    expect(out).toContain("• Cal ok");
    expect(out).toContain("• News ok");
  });
});

describe("runBrainTurn", () => {
  it("returns stub reminder without LLM", async () => {
    const n = await runBrainTurn({
      intent: intent({ kind: "reminder", title: "Dentist" }),
      llmConfig: null,
    });
    expect(n?.title).toBe("Dentist");
    expect(n?.body).toBe("Dentist");
  });

  it("aggregates worker overrides for briefing", async () => {
    const n = await runBrainTurn({
      intent: intent({ kind: "daily-briefing", title: "Morning" }),
      llmConfig: null,
      runWorkerOverride: async (task) => `result:${task.id}`,
    });
    expect(n?.body).toContain("result:calendar");
    expect(n?.body).toContain("result:feeds");
  });

  it("returns null for quiet watch", async () => {
    const n = await runBrainTurn({
      intent: intent({ kind: "watch", title: "Markets" }),
      llmConfig: null,
      runWorkerOverride: async () => null,
    });
    expect(n).toBeNull();
  });

  it("falls back to stub when no LLM config", async () => {
    const n = await runBrainTurn({
      intent: intent({ kind: "daily-briefing", title: "Morning" }),
      llmConfig: null,
    });
    expect(n?.kind).toBe("daily-briefing");
    expect(n?.body.length).toBeGreaterThan(0);
  });

  it("respects maxWorkers budget", async () => {
    const calls: string[] = [];
    await runBrainTurn({
      intent: intent({
        kind: "daily-briefing",
        title: "Morning",
        scope: { topics: ["a", "b", "c"] },
      }),
      llmConfig: null,
      budget: { maxWorkers: 2 },
      runWorkerOverride: async (task) => {
        calls.push(task.id);
        return task.id;
      },
    });
    expect(calls).toHaveLength(2);
  });

  it("aborts on wall clock via signal in override", async () => {
    vi.useFakeTimers();
    const promise = runBrainTurn({
      intent: intent({ kind: "watch", title: "Slow" }),
      llmConfig: null,
      budget: { wallClockMs: 50 },
      runWorkerOverride: async (_task, signal) => {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 200);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            resolve();
          });
        });
        return signal.aborted ? null : "late";
      },
    });
    await vi.advanceTimersByTimeAsync(60);
    const n = await promise;
    expect(n).toBeNull();
    vi.useRealTimers();
  });
});
