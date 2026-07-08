import { describe, expect, it } from "vitest";
import { coalesceTurnMessages } from "./coalesceTurnMessages.js";

describe("coalesceTurnMessages", () => {
  it("passes through non-briefing turns unchanged", () => {
    const messages = [
      { type: "text", text: "Hello" },
      { type: "composition", composition: { surfaceId: "schedule-today", intent: "Schedule" } },
    ];
    expect(coalesceTurnMessages(messages)).toEqual(messages);
  });

  it("keeps one short intro and last briefing-daily composition", () => {
    const result = coalesceTurnMessages([
      { type: "text", text: "RSS headline one\nRSS headline two\nRSS headline three" },
      { type: "text", text: "Good morning." },
      { type: "composition", composition: { surfaceId: "schedule-today", intent: "Today" } },
      { type: "composition", composition: { surfaceId: "rss-feeds", intent: "RSS" } },
      {
        type: "composition",
        composition: { surfaceId: "briefing-daily", intent: "Daily briefing roundup" },
      },
      {
        type: "composition",
        composition: { surfaceId: "briefing-daily", intent: "Daily briefing roundup v2" },
      },
    ]) as Array<{
      type: string;
      text?: string;
      composition?: { surfaceId?: string; intent?: string };
    }>;

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "text", text: "Good morning." });
    expect(result[1]?.composition?.surfaceId).toBe("briefing-daily");
    expect(result[1]?.composition?.intent).toBe("Daily briefing roundup v2");
  });
});
