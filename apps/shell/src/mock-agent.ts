import {
  SessionEmitter,
  type AgentSession,
  type Composition,
  type ConsequentialAction,
  type UiEvent,
} from "@atom/shell-core";
import type { PromptProfile } from "@atom/agent-llm";

interface MockAgentOptions {
  profileProvider?: () => PromptProfile;
}

/**
 * Scripted stand-in for a real agent backend (proof point 1 validates the
 * vocabulary before any model is wired in). Speaks the same AgentSession
 * contract an AG-UI adapter will.
 */
export class MockAgentSession extends SessionEmitter implements AgentSession {
  private queue: ReturnType<typeof setTimeout>[] = [];
  private surfaceCounter = 0;
  private profileProvider?: () => PromptProfile;
  private pendingFlightOption: string | null = null;

  constructor(options?: MockAgentOptions) {
    super();
    this.profileProvider = options?.profileProvider;
  }

  private later(ms: number, fn: () => void): void {
    this.queue.push(setTimeout(fn, ms));
  }

  private finishTurn(): void {
    this.later(50, () => this.emit({ type: "done" }));
  }

  private nextSurfaceId(): string {
    this.surfaceCounter += 1;
    return `surface-${this.surfaceCounter}`;
  }

  sendUserMessage(text: string): void {
    const lower = text.toLowerCase();
    if (
      lower.includes("seat") &&
      (lower.includes("prefer") || lower.includes("book") || lower.includes("which"))
    ) {
      this.runGuardedPreferenceScenario();
    } else if (lower.includes("flight") || lower.includes("tokyo")) {
      this.runFlightScenario();
    } else if (lower.includes("spend") || lower.includes("budget")) {
      this.runSpendingScenario();
    } else {
      this.later(400, () =>
        this.emit({
          type: "text",
          text:
            "This mock agent knows three scripts: ask about seats/preferences (guarded disclosure), a flight to Tokyo (optional seat-map module), or your spending.",
        }),
      );
      this.later(450, () => this.finishTurn());
    }
  }

  sendUiEvent(event: UiEvent): void {
    if (event.name === "selected") {
      const optionId = (event.payload as { optionId?: string })?.optionId ?? "unknown";
      this.pendingFlightOption = optionId;
      this.later(400, () =>
        this.emit({
          type: "text",
          text: "Flight option noted. Pick a seat on the map — the shell will lazy-load travel/seat-map from your registry.",
        }),
      );
      this.later(900, () =>
        this.emit({ type: "composition", composition: this.seatMapSurface(this.nextSurfaceId()) }),
      );
      this.later(950, () => this.finishTurn());
      return;
    }

    if (event.name === "seatSelected") {
      const seatId = (event.payload as { seatId?: string })?.seatId ?? "unknown";
      const optionId = this.pendingFlightOption ?? "unknown";
      this.later(400, () =>
        this.emit({ type: "text", text: `Seat ${seatId} selected. Confirming booking terms…` }),
      );
      this.later(900, () =>
        this.emit({
          type: "consequential-action",
          surfaceId: event.surfaceId,
          action: this.flightConfirmation(optionId, seatId),
        }),
      );
      this.later(950, () => this.finishTurn());
    }
  }

  sendActionDecision(actionId: string, decision: "approved" | "declined"): void {
    if (decision === "approved") {
      this.later(500, () => this.emit({ type: "composition", composition: this.receipt(actionId) }));
      this.later(600, () =>
        this.emit({
          type: "text",
          text: "Booked. The signed receipt is above; it's also in your attestation log.",
        }),
      );
    } else {
      this.later(400, () =>
        this.emit({ type: "text", text: "Declined — nothing was booked and no funds were held." }),
      );
    }
    this.later(700, () => this.finishTurn());
  }

  sendDataDisclosure(
    requestId: string,
    decision: "approved" | "declined",
    records: Array<{ category: string; label: string; value: unknown }>,
  ): void {
    if (decision === "approved" && records.length > 0) {
      const summary = records.map((record) => `${record.label}: ${String(record.value)}`).join("; ");
      this.later(400, () =>
        this.emit({
          type: "text",
          text: `Thanks — I'll use your disclosed preferences (${summary}) for seat selection.`,
        }),
      );
    } else {
      this.later(400, () =>
        this.emit({
          type: "text",
          text: "Understood — I won't use stored preferences without your approval.",
        }),
      );
    }
    this.later(500, () => this.finishTurn());
  }

  dispose(): void {
    for (const handle of this.queue) clearTimeout(handle);
  }

  // --- Scenario: guarded preference disclosure ---

  private runGuardedPreferenceScenario(): void {
    const profile = this.profileProvider?.();
    const hasGuardedPrefs = profile?.guardedCategories.includes("preferences") ?? false;

    if (!hasGuardedPrefs) {
      this.later(300, () =>
        this.emit({
          type: "text",
          text:
            'Add a guarded record in the "preferences" category via Profile, then ask again — e.g. "Which seats should I book?"',
        }),
      );
      this.later(350, () => this.finishTurn());
      return;
    }

    this.later(300, () =>
      this.emit({
        type: "text",
        text: "I can see you have guarded preferences but not their contents. I'll ask the shell to disclose them.",
      }),
    );
    this.later(800, () =>
      this.emit({
        type: "data-request",
        request: {
          requestId: "req-seat-pref",
          categories: ["preferences"],
          reason: "To select seats that match your stated aisle/window preference when booking.",
        },
      }),
    );
    this.later(850, () => this.finishTurn());
  }

  // --- Scenario 1: flight booking (choice → optional module seat map → chrome) ---

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
        text: "Three options fit your preferences. Pick one — you'll choose a seat via the travel/seat-map module next (lazy-loaded from registry when modules are on).",
      }),
    );
    this.later(1550, () => this.finishTurn());
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

  private seatMapSurface(surfaceId: string): Composition {
    return {
      version: 1,
      surfaceId,
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
    };
  }

  private flightConfirmation(optionId: string, seatId?: string): ConsequentialAction {
    const flights: Record<string, { label: string; price: string }> = {
      "ana-direct": { label: "ANA NH212 · LHR → HND · 12 Aug, 11:35", price: "£612.00" },
      "ba-direct": { label: "BA005 · LHR → HND · 12 Aug, 13:40", price: "£648.00" },
      "klm-1stop": { label: "KLM · LHR → AMS → HND · 12 Aug, 06:20", price: "£489.00" },
    };
    const flight = flights[optionId] ?? { label: optionId, price: "unknown" };
    const terms: Record<string, string> = {
      flight: flight.label,
      "return flight": "19 Aug (same routing)",
      passenger: "1 adult",
      total: flight.price,
      payment: "Authorization hold on Visa ····4421, captured only on airline confirmation",
      cancellation: "Free cancellation for 24 hours",
    };
    if (seatId) terms.seat = seatId;
    return {
      id: `book-${optionId}${seatId ? `-${seatId}` : ""}`,
      kind: "payment",
      title: "Book flight and authorize payment",
      terms,
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
                    "Seat held per your selection.",
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
    this.later(1400, () => this.finishTurn());
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
