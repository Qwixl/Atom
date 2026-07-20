import { describe, expect, it } from "vitest";
import { SwarmToolBudget } from "./swarmToolBudget.js";

describe("SwarmToolBudget", () => {
  it("allows search under hourly and daily caps", () => {
    const budget = new SwarmToolBudget({ searchPerHour: 2, searchPerDay: 3 });
    const t0 = Date.parse("2026-07-20T12:00:00.000Z");
    expect(budget.tryConsumeSearch("news_search", t0).ok).toBe(true);
    expect(budget.tryConsumeSearch("page_read", t0 + 1).ok).toBe(true);
    const denied = budget.tryConsumeSearch("news_search", t0 + 2);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it("does not rate-limit memory_remember", () => {
    const budget = new SwarmToolBudget({ searchPerHour: 0, searchPerDay: 0 });
    expect(budget.tryConsumeSearch("memory_remember").ok).toBe(true);
  });

  it("enforces daily cap across hours", () => {
    const budget = new SwarmToolBudget({ searchPerHour: 100, searchPerDay: 2 });
    const day = Date.parse("2026-07-20T01:00:00.000Z");
    expect(budget.tryConsumeSearch("news_search", day).ok).toBe(true);
    expect(budget.tryConsumeSearch("news_search", day + 3_600_000).ok).toBe(true);
    expect(budget.tryConsumeSearch("page_read", day + 7_200_000).ok).toBe(false);
  });
});
