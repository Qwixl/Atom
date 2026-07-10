import { describe, expect, it } from "vitest";
import { Catalog, registerCorePrimitives } from "@qwixl/shell-core";
import { buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt calendar guidance", () => {
  const catalog = new Catalog();
  registerCorePrimitives(catalog);

  it("includes schedule and calendar-add worked examples", () => {
    const prompt = buildSystemPrompt(catalog, {
      open: [],
      guardedCategories: [],
      calendarContext: "Connected (read-only via WebCal).\nToday:\n- Standup: Tue 9:00 AM",
    });
    expect(prompt).toContain("Worked example — today's schedule");
    expect(prompt).toContain("Composition grammar");
    expect(prompt).toContain("core/stack");
    expect(prompt).toContain("Worked example — personal calendar add");
    expect(prompt).toContain("consequential-action");
    expect(prompt).toContain("scheduling/meeting-picker");
  });

  it("states meeting-picker is not for schedule read", () => {
    const prompt = buildSystemPrompt(catalog, {
      open: [],
      guardedCategories: [],
      calendarContext: "Today: no events in feed.",
    });
    expect(prompt).toContain("Never use `scheduling/meeting-picker` to **read**");
    expect(prompt).toContain("Nothing on your calendar today");
  });

  it("includes location guidance for weather defaults", () => {
    const prompt = buildSystemPrompt(catalog, {
      open: [],
      guardedCategories: [],
      locationContext:
        "Home location (owner-declared): Berlin\nWeather default: call weather_get_forecast",
    });
    expect(prompt).toContain("## Location (weather defaults)");
    expect(prompt).toContain("Berlin");
    expect(prompt).toContain("family/location-pin");
  });

  it("includes tool-judgment protocol", () => {
    const prompt = buildSystemPrompt(catalog, { open: [], guardedCategories: [] });
    expect(prompt).toContain("## Choosing tools and actions");
    expect(prompt).toContain("page_read");
    expect(prompt).toContain("news_search");
  });

  it("includes Coming up briefing example and forbids feeds-only when connected", () => {
    const prompt = buildSystemPrompt(catalog, {
      open: [],
      guardedCategories: [],
      calendarContext: "Connected (read-only via WebCal).\nToday:\n(no events)\nUpcoming:\n- Team sync",
      rssContext: "Connected.\n- [News](https://example.com)",
    });
    expect(prompt).toContain("Worked example — connected calendar with Upcoming + feeds");
    expect(prompt).toContain("never emit a feeds-only briefing");
    expect(prompt).toContain('"title": "Coming up"');
  });

  it("includes soft-confirm settings proposal guidance", () => {
    const prompt = buildSystemPrompt(catalog, { open: [], guardedCategories: [] });
    expect(prompt).toContain("Soft-confirm settings proposals");
    expect(prompt).toContain("settingsProposal");
    expect(prompt).toContain("If that format works for you");
    expect(prompt).toContain("WRONG (text-only promise");
    expect(prompt).toContain("[settings-assent]");
    expect(prompt).toContain("Owner connector tools");
    expect(prompt).not.toContain("shell may still save");
  });

  it("teaches renderer-correct table/status props and chart/image examples", () => {
    const prompt = buildSystemPrompt(catalog, { open: [], guardedCategories: [] });
    expect(prompt).toContain('"columns": ["Option", "Price", "Notes"]');
    expect(prompt).not.toContain('"headers": ["Option"');
    expect(prompt).toContain('"text": "Fetching calendar…"');
    expect(prompt).not.toContain('"label": "Fetching calendar…"');
    expect(prompt).toContain("Worked example — simple chart");
    expect(prompt).toContain("Worked example — image in a card");
    expect(prompt).toContain('"component": "core/chart"');
  });
});
