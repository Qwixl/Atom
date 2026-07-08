import { describe, expect, it } from "vitest";
import {
  Catalog,
  ConversationRuntime,
  SessionEmitter,
  allowCompositionDuringGame,
  parseAgentProtocolMessage,
  registerCorePrimitives,
  type AgentOutput,
} from "@qwixl/shell-core";

const SCHEDULE_COMPOSITION = {
  version: 1 as const,
  surfaceId: "schedule-today",
  intent: "Today's calendar events",
  root: {
    id: "schedule-card",
    component: "core/card",
    semanticRole: "container/card",
    props: { title: "Today" },
    children: [
      {
        id: "schedule-list",
        component: "core/list",
        semanticRole: "collection/list",
        props: {
          items: [
            "Team standup: Tue, Jul 7, 10:00 AM – 10:30 AM",
            "Reminder - Test!: Tue, Jul 7, 05:00 PM – 06:00 PM",
          ],
        },
      },
    ],
  },
};

class TestSession extends SessionEmitter {
  emitAll(outputs: AgentOutput[]) {
    for (const output of outputs) this.emit(output);
  }
}

describe("schedule composition loop", () => {
  it("accepts live LLM schedule payload through agent protocol parser", () => {
    const parsed = parseAgentProtocolMessage({
      type: "composition",
      composition: SCHEDULE_COMPOSITION,
    });
    expect(parsed?.kind).toBe("output");
    if (parsed?.kind === "output") {
      expect(parsed.output.type).toBe("composition");
    }
  });

  it("is not blocked by allowCompositionDuringGame", () => {
    expect(allowCompositionDuringGame(SCHEDULE_COMPOSITION, [])).toBe(true);
  });

  it("upserts core/card + core/list surface from agent output", async () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);

    const runtime = new ConversationRuntime({
      catalog,
      shouldReplaceSurface: (composition, feed) => allowCompositionDuringGame(composition, feed),
    });

    await runtime.handleAgentOutput({
      type: "text",
      text: "Here's what's on your calendar today.",
    });
    await runtime.handleAgentOutput({
      type: "composition",
      composition: SCHEDULE_COMPOSITION,
    });

    const { feed } = runtime.getSnapshot();
    expect(feed.some((item) => item.kind === "agent-text")).toBe(true);
    const surface = feed.find((item) => item.kind === "surface");
    expect(surface?.kind).toBe("surface");
    if (surface?.kind === "surface") {
      expect(surface.surface.root.node.component).toBe("core/card");
      const list = surface.surface.root.children[0];
      expect(list?.node.component).toBe("core/list");
      expect(list?.node.props?.items).toEqual(SCHEDULE_COMPOSITION.root.children[0].props.items);
    }
  });

  it("upserts surface when session is rebound mid-turn (deferred unsub)", async () => {
    const catalog = new Catalog();
    registerCorePrimitives(catalog);

    const runtime = new ConversationRuntime({
      catalog,
      shouldReplaceSurface: (composition, feed) => allowCompositionDuringGame(composition, feed),
    });

    const sessionA = new TestSession();
    runtime.bindSession(sessionA);

    sessionA.emitAll([{ type: "text", text: "Here's what's on your calendar today." }]);

    const sessionB = new TestSession();
    runtime.bindSession(sessionB);

    sessionB.emitAll([
      { type: "composition", composition: SCHEDULE_COMPOSITION },
      { type: "done" },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const { feed } = runtime.getSnapshot();
    expect(feed.some((item) => item.kind === "agent-text")).toBe(true);
    expect(feed.some((item) => item.kind === "surface")).toBe(true);
  });

  it("accepts the live OpenAI schedule payload shape", () => {
    const raw =
      '{"messages":[{"type":"text","text":"Here\'s what\'s on your calendar today."},{"type":"composition","composition":{"version":1,"surfaceId":"schedule-today","intent":"Today\'s calendar events","root":{"id":"schedule-card","component":"core/card","semanticRole":"container/card","props":{"title":"Today"},"children":[{"id":"schedule-list","component":"core/list","semanticRole":"collection/list","props":{"items":["Team standup: Tue, Jul 7, 10:00 AM – 10:30 AM","Reminder - Test!: Tue, Jul 7, 05:00 PM – 06:00 PM","new cal item: Tue, Jul 7, 09:00 PM – 10:00 PM"]}}]}}}]}';

    const parsed = JSON.parse(raw) as { messages: unknown[] };
    for (const message of parsed.messages) {
      const result = parseAgentProtocolMessage(message);
      expect(result?.kind).toBe("output");
    }
  });
});
