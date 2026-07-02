import {
  SessionEmitter,
  type AgentSession,
  type Composition,
  type ConsequentialAction,
  type UiEvent,
} from "@atom/shell-core";

/**
 * Scripted stand-in for a real agent backend (proof point 1 validates the
 * vocabulary before any model is wired in). Speaks the same AgentSession
 * contract an AG-UI adapter will.
 */
export class MockAgentSession extends SessionEmitter implements AgentSession {
  private queue: ReturnType<typeof setTimeout>[] = [];
  private surfaceCounter = 0;

  private later(ms: number, fn: () => void): void {
    this.queue.push(setTimeout(fn, ms));
  }

  private nextSurfaceId(): string {
    this.surfaceCounter += 1;
    return `surface-${this.surfaceCounter}`;
  }

  sendUserMessage(text: string): void {
    const lower = text.toLowerCase();
    if (lower.includes("flight") || lower.includes("tokyo")) {
      this.runFlightScenario();
    } else if (lower.includes("spend") || lower.includes("budget")) {
      this.runSpendingScenario();
    } else {
      this.later(400, () =>
        this.emit({
          type: "text",
          text:
            "This mock agent knows two scripts: ask about a flight to Tokyo, or ask to see your spending.",
        }),
      );
      this.later(450, () => this.emit({ type: "done" }));
    }
  }

  sendUiEvent(event: UiEvent): void {
    if (event.name === "selected") {
      const optionId = (event.payload as { optionId?: string })?.optionId ?? "unknown";
      this.later(400, () =>
        this.emit({
          type: "text",
          text: `Good choice. Preparing the booking for option ${optionId} — you'll confirm the exact terms before anything happens.`,
        }),
      );
      this.later(900, () =>
        this.emit({
          type: "consequential-action",
          surfaceId: event.surfaceId,
          action: this.flightConfirmation(optionId),
        }),
      );
    }
  }

  sendActionDecision(actionId: string, decision: "approved" | "declined"): void {
    if (decision === "approved") {
      this.later(500, () => this.emit({ type: "composition", composition: this.receipt(actionId) }));
      this.later(600, () =>
        this.emit({ type: "text", text: "Booked. The signed receipt is above; it's also in your attestation log." }),
      );
    } else {
      this.later(400, () =>
        this.emit({ type: "text", text: "Declined — nothing was booked and no funds were held." }),
      );
    }
    this.later(700, () => this.emit({ type: "done" }));
  }

  dispose(): void {
    for (const handle of this.queue) clearTimeout(handle);
  }

  // --- Scenario 1: flight booking (choice → chrome confirmation → receipt) ---

  private runFlightScenario(): void {
    const surfaceId = this.nextSurfaceId();
    this.later(300, () =>
      this.emit({ type: "text", text: "Searching flights to Tokyo for your dates…" }),
    );
    this.later(1400, () =>
      this.emit({ type: "composition", composition: this.flightOptions(surfaceId) }),
    );
    this.later(1500, () =>
      this.emit({
        type: "text",
        text: "Three options fit your preferences. I'd take the ANA direct — best balance of price and arrival time.",
      }),
    );
  }

  private flightOptions(surfaceId: string): Composition {
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
                  description: "LHR 11:35 → HND 07:15 (+1) · 13h 40m",
                  detail: "Arrives before hotel check-in; matches your aisle-seat preference.",
                  recommended: true,
                },
                {
                  id: "ba-direct",
                  label: "British Airways · direct · £648",
                  description: "LHR 13:40 → HND 09:55 (+1) · 14h 15m",
                },
                {
                  id: "klm-1stop",
                  label: "KLM · 1 stop (AMS) · £489",
                  description: "LHR 06:20 → HND 08:05 (+1) · 18h 45m",
                  detail: "Cheapest, but the 6am departure conflicts with your stated morning constraint.",
                },
              ],
            },
          },
          {
            id: "note",
            component: "core/status",
            props: { text: "Prices held for 20 minutes via reservation soft-lock.", tone: "info" },
          },
        ],
      },
    };
  }

  private flightConfirmation(optionId: string): ConsequentialAction {
    const flights: Record<string, { label: string; price: string }> = {
      "ana-direct": { label: "ANA NH212 · LHR → HND · 12 Aug, 11:35", price: "£612.00" },
      "ba-direct": { label: "BA005 · LHR → HND · 12 Aug, 13:40", price: "£648.00" },
      "klm-1stop": { label: "KLM · LHR → AMS → HND · 12 Aug, 06:20", price: "£489.00" },
    };
    const flight = flights[optionId] ?? { label: optionId, price: "unknown" };
    return {
      id: `book-${optionId}`,
      kind: "payment",
      title: "Book flight and authorize payment",
      terms: {
        flight: flight.label,
        "return flight": "19 Aug (same routing)",
        passenger: "1 adult",
        total: flight.price,
        payment: `Authorization hold on Visa ····4421, captured only on airline confirmation`,
        cancellation: "Free cancellation for 24 hours",
      },
      confirmLabel: `Authorize ${flight.price}`,
      declineLabel: "Cancel",
    };
  }

  private receipt(actionId: string): Composition {
    return {
      version: 1,
      surfaceId: this.nextSurfaceId(),
      intent: "Booking receipt",
      root: {
        id: "root",
        component: "core/card",
        props: { title: "Booking confirmed", subtitle: `Reference ATM-2026-${actionId}` },
        children: [
          {
            id: "summary",
            component: "core/table",
            props: {
              columns: ["Item", "Detail"],
              rows: [
                ["Status", "Ticketed"],
                ["Funds", "Hold captured on confirmation"],
                ["Receipt object", "Signed by counterpart agent"],
              ],
            },
          },
          {
            id: "next",
            component: "core/disclosure",
            props: { summary: "What happens next" },
            children: [
              {
                id: "next-list",
                component: "core/list",
                props: {
                  items: [
                    "Check-in opens 24h before departure; I'll handle it.",
                    "Seat 22C held per your aisle preference.",
                    "I'll monitor for schedule changes and rebook within your constraints if needed.",
                  ],
                },
              },
            ],
          },
        ],
      },
    };
  }

  // --- Scenario 2: spending view (module missing → semantic-role fallback) ---

  private runSpendingScenario(): void {
    const surfaceId = this.nextSurfaceId();
    this.later(300, () => this.emit({ type: "text", text: "Pulling your last three months of spending…" }));
    this.later(1200, () =>
      this.emit({ type: "composition", composition: this.spendingSurface(surfaceId) }),
    );
    this.later(1300, () =>
      this.emit({
        type: "text",
        text: "Note: I composed this with the finance/spend-chart module, which isn't installed in your shell — watch it degrade gracefully to core primitives.",
      }),
    );
    this.later(1400, () => this.emit({ type: "done" }));
  }

  private spendingSurface(surfaceId: string): Composition {
    return {
      version: 1,
      surfaceId,
      intent: "Monthly spending overview",
      root: {
        id: "root",
        component: "core/card",
        props: { title: "Spending", subtitle: "April – June 2026" },
        children: [
          {
            // Not installed: has a semanticRole, so the resolver substitutes core/chart.
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
              unit: "GBP",
            },
          },
          {
            // Not installed and no semanticRole: renders as raw fallback.
            id: "insights",
            component: "finance/insight-panel@1",
            props: {
              topCategory: "Groceries",
              largestSingle: "£312 — flight deposit",
              vsLastQuarter: "-8%",
            },
          },
          {
            id: "note",
            component: "core/status",
            props: {
              text: "Two modules were unavailable; everything above is shell-rendered fallback.",
              tone: "warn",
            },
          },
        ],
      },
    };
  }
}
