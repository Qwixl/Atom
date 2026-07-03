import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/client";
import {
  atomCompositionEvent,
  atomConsequentialActionEvent,
  atomDataRequestEvent,
} from "@qwixl/ag-ui-adapter";
import { A2UI_AGUI_EVENT, type A2uiEnvelope } from "@qwixl/a2ui-adapter";
import type { Composition, ConsequentialAction } from "@qwixl/shell-core";
import { v4 as uuid } from "uuid";

function a2uiCustomEvent(envelope: A2uiEnvelope): BaseEvent {
  return { type: EventType.CUSTOM, name: A2UI_AGUI_EVENT, value: envelope };
}

function lastUserText(input: RunAgentInput): string {
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const message = input.messages[i];
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }
  return "";
}

function textEvents(messageId: string, text: string): BaseEvent[] {
  return [
    { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text },
    { type: EventType.TEXT_MESSAGE_END, messageId },
  ];
}

function scheduleSlots(surfaceId: string): Composition {
  return {
    version: 1,
    surfaceId,
    intent: "Choose a standup time",
    root: {
      id: "root",
      component: "core/card",
      props: { title: "Team standup", subtitle: "Weekly · 30 min" },
      children: [
        {
          id: "slots",
          component: "core/choice",
          semanticRole: "input/choice",
          events: ["selected"],
          props: {
            options: [
              { id: "tue-10", label: "Tue 8 Jul · 10:00", recommended: true },
              { id: "wed-14", label: "Wed 9 Jul · 14:00" },
            ],
          },
        },
      ],
    },
  };
}

function scheduleConfirmation(slotId: string): ConsequentialAction {
  const when =
    slotId === "wed-14" ? "Wed 9 Jul · 14:00–14:30" : "Tue 8 Jul · 10:00–10:30";
  return {
    id: `sched-${slotId}`,
    kind: "confirmation",
    title: "Schedule team standup",
    terms: {
      event: "Team standup",
      when,
      action: "Create calendar event and send invites",
    },
    confirmLabel: "Add to calendar",
    declineLabel: "Cancel",
  };
}

function rsvpSurface(surfaceId: string): Composition {
  return {
    version: 1,
    surfaceId,
    intent: "RSVP to design review",
    root: {
      id: "root",
      component: "core/card",
      props: { title: "Design review", subtitle: "Thu 10 Jul · 15:00" },
      children: [
        {
          id: "rsvp",
          component: "core/choice",
          semanticRole: "input/choice",
          events: ["selected"],
          props: {
            options: [
              { id: "rsvp-yes", label: "Yes, I'll attend", recommended: true },
              { id: "rsvp-no", label: "No, decline" },
            ],
          },
        },
      ],
    },
  };
}

/** Reference AG-UI backend: scheduling/RSVP vertical (M3). */
export function* scenarioEvents(input: RunAgentInput): Generator<BaseEvent> {
  const text = lastUserText(input).toLowerCase();
  const messageId = uuid();

  if (text.includes("time") && (text.includes("standup") || text.includes("works"))) {
    yield* textEvents(messageId, "Requesting guarded scheduling preferences via shell chrome.");
    yield atomDataRequestEvent({
      requestId: "req-sched-pref",
      categories: ["preferences"],
      reason: "To propose standup times matching your availability.",
    });
    return;
  }

  if (text.includes("[data-disclosure]")) {
    yield* textEvents(messageId, "Thanks — proposing slots that match your availability.");
    yield atomCompositionEvent(scheduleSlots(uuid()));
    return;
  }

  if (text.includes("[ui-event]") && text.includes("selected")) {
    const optionMatch = lastUserText(input).match(/"optionId"\s*:\s*"([^"]+)"/);
    const optionId = optionMatch?.[1] ?? "tue-10";
    if (optionId.startsWith("rsvp-") && optionId !== "rsvp-no") {
      yield* textEvents(messageId, "Confirm RSVP in shell chrome.");
      yield atomConsequentialActionEvent("rsvp", {
        id: "rsvp-design-review",
        kind: "confirmation",
        title: "Update RSVP",
        terms: {
          event: "Design review",
          when: "Thu 10 Jul · 15:00",
          response: optionId === "rsvp-yes" ? "Yes" : "Maybe",
          action: "Send RSVP to organizer",
        },
        confirmLabel: "Confirm RSVP",
        declineLabel: "Cancel",
      });
      return;
    }
    yield* textEvents(messageId, "Slot selected — confirm calendar update in shell chrome.");
    yield atomConsequentialActionEvent("schedule", scheduleConfirmation(optionId));
    return;
  }

  if (text.includes("rsvp") || text.includes("design review")) {
    yield* textEvents(messageId, "Design review invite — pick your response.");
    yield atomCompositionEvent(rsvpSurface(uuid()));
    return;
  }

  if (text.includes("schedule") || text.includes("standup") || text.includes("meeting")) {
    if (text.includes("a2ui")) {
      const surfaceId = uuid();
      yield* textEvents(messageId, "Standup slots via A2UI v0.9.1 envelopes…");
      yield a2uiCustomEvent({
        version: "v0.9.1",
        createSurface: {
          surfaceId,
          catalogId: "https://a2ui.org/specification/v0_9_1/catalogs/basic/catalog.json",
          intent: "Choose a standup time",
        },
      });
      yield a2uiCustomEvent({
        version: "v0.9.1",
        updateComponents: {
          surfaceId,
          components: [
            {
              id: "root",
              component: "Card",
              title: "Team standup",
              subtitle: "Pick a slot",
              child: "body",
            },
            {
              id: "body",
              component: "Column",
              children: ["slot_a", "slot_b"],
            },
            { id: "slot_a", component: "Button", label: "Tue 8 Jul · 10:00" },
            { id: "slot_b", component: "Button", label: "Wed 9 Jul · 14:00" },
          ],
        },
      });
      return;
    }
    yield* textEvents(messageId, "Checking calendars for next week…");
    yield atomCompositionEvent(scheduleSlots(uuid()));
    return;
  }

  if (text.includes("spend") || text.includes("budget")) {
    yield* textEvents(messageId, "Spending overview (finance module unavailable — expect fallback).");
    yield atomCompositionEvent({
      version: 1,
      surfaceId: uuid(),
      intent: "Spending overview",
      root: {
        id: "root",
        component: "core/card",
        props: { title: "Spending", subtitle: "April – June 2026" },
        children: [
          {
            id: "trend",
            component: "finance/spend-chart@1",
            semanticRole: "chart/time-series",
            props: {
              series: [
                {
                  label: "Monthly spend (£)",
                  points: [
                    { x: "Apr", y: 1840 },
                    { x: "May", y: 2210 },
                    { x: "Jun", y: 1675 },
                  ],
                },
              ],
            },
          },
        ],
      },
    });
    return;
  }

  yield* textEvents(
    messageId,
    "AG-UI reference: try scheduling a standup, RSVP to design review, 'a2ui schedule standup', or spending.",
  );
}
