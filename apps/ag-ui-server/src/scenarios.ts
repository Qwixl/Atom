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

function flightOptions(surfaceId: string): Composition {
  return {
    version: 1,
    surfaceId,
    intent: "Choose a flight to Tokyo",
    root: {
      id: "root",
      component: "core/card",
      props: { title: "Flights to Tokyo", subtitle: "12–19 August · 1 adult · economy" },
      children: [
        {
          id: "options",
          component: "core/choice",
          semanticRole: "input/choice",
          events: ["selected"],
          props: {
            options: [
              {
                id: "ana-direct",
                label: "ANA · direct · £612",
                description: "LHR 11:35 → HND 07:15 (+1)",
                recommended: true,
              },
              {
                id: "ba-direct",
                label: "British Airways · direct · £648",
                description: "LHR 13:40 → HND 09:55 (+1)",
              },
            ],
          },
        },
      ],
    },
  };
}

function flightConfirmation(optionId: string, seatId?: string): ConsequentialAction {
  const terms: Record<string, string> = {
    flight: "ANA NH212 · LHR → HND · 12 Aug, 11:35",
    total: "£612.00",
    payment: "Authorization hold on Visa ····4421",
  };
  if (seatId) terms.seat = seatId;
  return {
    id: `book-${optionId}${seatId ? `-${seatId}` : ""}`,
    kind: "payment",
    title: "Book flight and authorize payment",
    terms,
    confirmLabel: "Authorize £612.00",
    declineLabel: "Cancel",
  };
}

/** Reference AG-UI backend: mock scenarios as standard + Atom CUSTOM events. */
export function* scenarioEvents(input: RunAgentInput): Generator<BaseEvent> {
  const text = lastUserText(input).toLowerCase();
  const messageId = uuid();

  if (text.includes("seat") && (text.includes("prefer") || text.includes("book"))) {
    yield* textEvents(
      messageId,
      "Guarded preferences detected — requesting disclosure via shell chrome.",
    );
    yield atomDataRequestEvent({
      requestId: "req-seat-pref",
      categories: ["preferences"],
      reason: "To select seats matching your stated aisle/window preference.",
    });
    return;
  }

  if (text.includes("[data-disclosure]")) {
    yield* textEvents(messageId, "Thanks — I'll use your disclosed preferences for seating.");
    return;
  }

  if (text.includes("[ui-event]") && text.includes("seatselected")) {
    const match = lastUserText(input).match(/"seatId"\s*:\s*"([^"]+)"/);
    const seatId = match?.[1] ?? "unknown";
    yield* textEvents(messageId, `Seat ${seatId} selected — confirm booking terms in shell chrome.`);
    yield atomConsequentialActionEvent("seat-map", flightConfirmation("ana-direct", seatId));
    return;
  }

  if (text.includes("[ui-event]") && text.includes("selected")) {
    yield* textEvents(messageId, "Flight noted. Pick a seat on the travel/seat-map module.");
    yield atomCompositionEvent({
      version: 1,
      surfaceId: uuid(),
      intent: "Choose your seat",
      root: {
        id: "root",
        component: "core/card",
        props: { title: "Seat selection", subtitle: "ANA NH212 · economy cabin" },
        children: [
          {
            id: "map",
            component: "travel/seat-map@1",
            semanticRole: "input/seat-map",
            events: ["seatSelected"],
            props: {
              flight: "ANA NH212 · LHR → HND",
              taken: ["18A", "19B", "20C", "22D"],
              recommended: ["22C", "23C"],
            },
          },
        ],
      },
    });
    return;
  }

  if (text.includes("flight") || text.includes("tokyo")) {
    if (text.includes("a2ui")) {
      const surfaceId = uuid();
      yield* textEvents(messageId, "Flights via A2UI v0.9.1 envelopes (createSurface + updateComponents)…");
      yield a2uiCustomEvent({
        version: "v0.9.1",
        createSurface: {
          surfaceId,
          catalogId: "https://a2ui.org/specification/v0_9_1/catalogs/basic/catalog.json",
          intent: "Choose a flight to Tokyo",
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
              title: "Flights to Tokyo",
              subtitle: "12–19 August · 1 adult · economy",
              child: "body",
            },
            {
              id: "body",
              component: "Column",
              children: ["intro", "ana_btn", "ba_btn"],
            },
            {
              id: "intro",
              component: "Text",
              text: "Pick a flight — rendered from A2UI basic catalog via @qwixl/a2ui-adapter",
              variant: "body",
            },
            {
              id: "ana_btn",
              component: "Button",
              label: "ANA · direct · £612",
            },
            {
              id: "ba_btn",
              component: "Button",
              label: "British Airways · direct · £648",
            },
          ],
        },
      });
      return;
    }
    yield* textEvents(messageId, "Searching flights to Tokyo…");
    yield atomCompositionEvent(flightOptions(uuid()));
    return;
  }

  if (text.includes("spend") || text.includes("budget")) {
    yield* textEvents(messageId, "Monthly spending (finance module unavailable — expect fallback).");
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
    "AG-UI reference server: try a flight to Tokyo, 'a2ui flight to Tokyo', spending, or seat preference disclosure.",
  );
}
