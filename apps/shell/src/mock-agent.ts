import {
  SessionEmitter,
  type AgentSession,
  type Composition,
  type ConsequentialAction,
  type UiEvent,
} from "@qwixl/shell-core";
import type { PromptProfile } from "@qwixl/agent-llm";
import {
  buildDefaultDemoSlots,
  buildSchedulingSlotsFromCalendar,
  type DemoCalendarEvent,
  type DemoSlotOption,
} from "./demoScheduling.js";

interface MockAgentOptions {
  profileProvider?: () => PromptProfile;
  webcalEventsProvider?: () => Promise<DemoCalendarEvent[]>;
}

type PendingStep =
  | { kind: "slot"; eventTitle: string; slotId: string; slotLabel: string; start: string; end: string }
  | { kind: "rsvp"; response: string };

function slotLabelWithEnd(slot: DemoSlotOption): string {
  const end = new Date(slot.end);
  return `${slot.label} – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * Scripted stand-in for a real agent backend. Primary vertical (M3): scheduling /
 * RSVP — trust-ladder phase 2/3, confirmation in shell chrome, no payment rails.
 */
export class MockAgentSession extends SessionEmitter implements AgentSession {
  private queue: ReturnType<typeof setTimeout>[] = [];
  private surfaceCounter = 0;
  private profileProvider?: () => PromptProfile;
  private webcalEventsProvider?: () => Promise<DemoCalendarEvent[]>;
  private scheduleSlotOptions: DemoSlotOption[] = buildDefaultDemoSlots();
  private pending: PendingStep | null = null;
  private tttState: {
    surfaceId: string;
    board: Array<"X" | "O" | null>;
    gameId: string;
  } | null = null;

  constructor(options?: MockAgentOptions) {
    super();
    this.profileProvider = options?.profileProvider;
    this.webcalEventsProvider = options?.webcalEventsProvider;
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
      lower.includes("time") &&
      (lower.includes("standup") || lower.includes("schedule") || lower.includes("works"))
    ) {
      this.runGuardedPreferenceScenario();
    } else if (lower.includes("rsvp") || lower.includes("design review")) {
      this.runRsvpScenario();
    } else if (
      lower.includes("schedule") ||
      lower.includes("standup") ||
      lower.includes("meeting") ||
      lower.includes("calendar")
    ) {
      this.runScheduleScenario();
    } else if (lower.includes("poll") || lower.includes("where should we")) {
      this.runPollScenario();
    } else if (
      lower.includes("shared list") ||
      lower.includes("grocery list") ||
      lower.includes("packing list")
    ) {
      this.runSharedListScenario();
    } else if (lower.includes("split") && lower.includes("bill")) {
      this.runSplitBillScenario();
    } else if (lower.includes("tic-tac-toe") || lower.includes("tictactoe") || lower.includes("play a game")) {
      this.runTttScenario();
    } else if (lower.includes("spend") || lower.includes("budget")) {
      this.runSpendingScenario();
    } else {
      this.later(400, () =>
        this.emit({
          type: "text",
          text:
            'Mock agent scripts: "Schedule a team standup next week", "RSVP to the design review", ' +
            '"What time works for our standup?" (guarded disclosure), or spending overview (fallback demo).',
        }),
      );
      this.later(450, () => this.finishTurn());
    }
  }

  sendUiEvent(event: UiEvent): void {
    if (event.name === "meetingProposed") {
      this.later(400, () =>
        this.emit({
          type: "text",
          text: "Opening Messages to send that proposal to your contact.",
        }),
      );
      this.later(450, () => this.finishTurn());
      return;
    }
    if (event.name === "pollCreated" || event.name === "listCreated" || event.name === "tttStart" || event.name === "splitProposed") {
      if (event.name === "tttStart") {
        this.tttState = {
          surfaceId: event.surfaceId,
          board: Array(9).fill(null),
          gameId: String((event.payload as { gameId?: string })?.gameId ?? "ttt-mock"),
        };
      }
      if (event.name !== "tttStart") {
        this.later(400, () =>
          this.emit({
            type: "text",
            text: "Opening Messages to continue with your contact.",
          }),
        );
        this.later(450, () => this.finishTurn());
      }
      return;
    }
    if (event.name === "tttMove") {
      const cell = (event.payload as { cell?: number })?.cell;
      if (this.tttState && typeof cell === "number" && cell >= 0 && cell < 9 && !this.tttState.board[cell]) {
        const board = [...this.tttState.board];
        board[cell] = "X";
        const botCell = board.findIndex((mark, index) => mark === null && index !== cell);
        if (botCell >= 0) board[botCell] = "O";
        this.tttState = { ...this.tttState, board };
        this.later(300, () =>
          this.emit({
            type: "composition",
            composition: this.tttSurface(this.tttState!.surfaceId, board),
          }),
        );
        this.later(350, () => this.finishTurn());
        return;
      }
    }
    if (event.name === "selected") {
      const optionId = (event.payload as { optionId?: string })?.optionId ?? "unknown";
      const label = (event.payload as { label?: string })?.label;

      if (optionId === "rsvp-yes" || optionId === "rsvp-maybe" || optionId === "rsvp-no") {
        if (optionId === "rsvp-no") {
          this.later(400, () =>
            this.emit({ type: "text", text: "Declined — I won't add the design review to your calendar." }),
          );
          this.later(500, () => this.finishTurn());
          return;
        }
        this.pending = { kind: "rsvp", response: optionId === "rsvp-maybe" ? "Maybe" : "Yes" };
        const rsvpResponse = this.pending.response;
        this.later(400, () =>
          this.emit({
            type: "text",
            text: `${rsvpResponse} noted. Confirm calendar update in shell chrome…`,
          }),
        );
        this.later(900, () =>
          this.emit({
            type: "consequential-action",
            surfaceId: event.surfaceId,
            action: this.rsvpConfirmation(rsvpResponse),
          }),
        );
        this.later(950, () => this.finishTurn());
        return;
      }

      const slot = this.scheduleSlotOptions.find((item) => item.id === optionId);
      const resolved = slot ?? buildDefaultDemoSlots()[0]!;
      const slotLabel = label ?? slotLabelWithEnd(resolved);
      this.pending = {
        kind: "slot",
        eventTitle: "Team standup",
        slotId: optionId,
        slotLabel,
        start: resolved.start,
        end: resolved.end,
      };
      this.later(400, () =>
        this.emit({ type: "text", text: `${slotLabel} works. Confirm the calendar hold in shell chrome…` }),
      );
      this.later(900, () =>
        this.emit({
          type: "consequential-action",
          surfaceId: event.surfaceId,
          action: this.scheduleConfirmation(this.pending as PendingStep & { kind: "slot" }),
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
          text: "Done. Google Calendar should have opened — click Save there to add the event. Details are in your attestation log.",
        }),
      );
    } else {
      this.later(400, () =>
        this.emit({ type: "text", text: "Declined — nothing was added to your calendar." }),
      );
    }
    this.pending = null;
    this.later(700, () => this.finishTurn());
  }

  sendDataDisclosure(
    _requestId: string,
    decision: "approved" | "declined",
    records: Array<{ category: string; label: string; value: unknown }>,
  ): void {
    if (decision === "approved" && records.length > 0) {
      const summary = records.map((r) => `${r.label}: ${String(r.value)}`).join("; ");
      this.later(400, () =>
        this.emit({
          type: "text",
          text: `Using your disclosed availability (${summary}) to pick standup slots…`,
        }),
      );
      this.later(900, () =>
        this.emit({
          type: "composition",
          composition: this.scheduleSlots(this.nextSurfaceId(), buildDefaultDemoSlots(), false),
        }),
      );
    } else {
      this.later(400, () =>
        this.emit({
          type: "text",
          text: "Understood — showing all slots without preference filtering.",
        }),
      );
      this.later(900, () =>
        this.emit({
          type: "composition",
          composition: this.scheduleSlots(this.nextSurfaceId(), buildDefaultDemoSlots(), false),
        }),
      );
    }
    this.later(950, () => this.finishTurn());
  }

  dispose(): void {
    for (const handle of this.queue) clearTimeout(handle);
  }

  // --- Guarded scheduling preferences ---

  private runGuardedPreferenceScenario(): void {
    const profile = this.profileProvider?.();
    const hasGuarded =
      profile?.guardedCategories.some((c) =>
        ["preferences", "scheduling", "calendar"].includes(c),
      ) ?? false;

    if (!hasGuarded) {
      this.later(300, () =>
        this.emit({
          type: "text",
          text:
            'Add a guarded record in Profile (category "preferences" or "scheduling"), then ask ' +
            '"What time works for our standup?"',
        }),
      );
      this.later(350, () => this.finishTurn());
      return;
    }

    this.later(300, () =>
      this.emit({
        type: "text",
        text: "I see guarded scheduling preferences — I'll ask the shell to disclose them.",
      }),
    );
    this.later(800, () =>
      this.emit({
        type: "data-request",
        request: {
          requestId: "req-sched-pref",
          categories: ["preferences"],
          reason: "To propose standup times that match your stated availability windows.",
        },
      }),
    );
    this.later(850, () => this.finishTurn());
  }

  // --- Schedule standup ---

  private runScheduleScenario(): void {
    const surfaceId = this.nextSurfaceId();
    this.later(300, () =>
      this.emit({
        type: "text",
        text: this.webcalEventsProvider
          ? "Reading your WebCal feed from your agent vault…"
          : "Checking calendars for next week…",
      }),
    );

    void (async () => {
      let events: DemoCalendarEvent[] = [];
      let slots = buildDefaultDemoSlots();
      if (this.webcalEventsProvider) {
        try {
          events = await this.webcalEventsProvider();
          slots = buildSchedulingSlotsFromCalendar(events);
        } catch {
          slots = buildDefaultDemoSlots();
        }
      }
      this.scheduleSlotOptions = slots;

      const statusText =
        events.length > 0
          ? `Loaded ${events.length} event(s) from your calendar. Slots marked “Free” do not overlap your schedule.`
          : this.webcalEventsProvider
            ? "Calendar connected — no events conflict with these times. Pick a slot:"
            : "Three slots for next week. Pick one — the shell confirms before anything hits your calendar.";

      this.later(500, () => this.emit({ type: "text", text: statusText }));
      this.later(1000, () =>
        this.emit({
          type: "composition",
          composition: this.meetingPickerSurface(surfaceId),
        }),
      );
      this.later(1050, () => this.finishTurn());
    })();
  }

  private runPollScenario(): void {
    const surfaceId = this.nextSurfaceId();
    this.later(300, () =>
      this.emit({ type: "text", text: "Set up a poll for your contact." }),
    );
    this.later(700, () =>
      this.emit({
        type: "composition",
        composition: this.pollComposerSurface(surfaceId),
      }),
    );
    this.later(750, () => this.finishTurn());
  }

  private runSharedListScenario(): void {
    const surfaceId = this.nextSurfaceId();
    this.later(300, () =>
      this.emit({ type: "text", text: "Create a shared list for your contact." }),
    );
    this.later(700, () =>
      this.emit({
        type: "composition",
        composition: this.sharedListComposerSurface(surfaceId),
      }),
    );
    this.later(750, () => this.finishTurn());
  }

  private runTttScenario(): void {
    const surfaceId = this.nextSurfaceId();
    const board = Array<"X" | "O" | null>(9).fill(null);
    this.tttState = { surfaceId, board, gameId: surfaceId };
    this.later(300, () =>
      this.emit({ type: "text", text: "You're X — tap a square." }),
    );
    this.later(700, () =>
      this.emit({
        type: "composition",
        composition: this.tttSurface(surfaceId, board),
      }),
    );
    this.later(750, () => this.finishTurn());
  }

  private runSplitBillScenario(): void {
    const surfaceId = this.nextSurfaceId();
    this.later(300, () =>
      this.emit({ type: "text", text: "Split a bill with your contact." }),
    );
    this.later(700, () =>
      this.emit({
        type: "composition",
        composition: this.splitBillSurface(surfaceId),
      }),
    );
    this.later(750, () => this.finishTurn());
  }

  private meetingPickerSurface(surfaceId: string): Composition {
    return {
      version: 1,
      surfaceId,
      intent: "Pick a meeting time",
      root: {
        id: "card",
        component: "core/card",
        semanticRole: "container/card",
        props: { title: "Schedule a meeting", subtitle: "Choose a time to propose" },
        children: [
          {
            id: "picker",
            component: "scheduling/meeting-picker",
            semanticRole: "input/datetime-picker",
            events: ["meetingProposed"],
            props: { defaultTitle: "Meeting" },
          },
        ],
      },
    };
  }

  private pollComposerSurface(surfaceId: string): Composition {
    return {
      version: 1,
      surfaceId,
      intent: "Create a poll",
      root: {
        id: "poll",
        component: "coordination/poll",
        semanticRole: "input/poll",
        events: ["pollCreated"],
        props: { mode: "compose" },
      },
    };
  }

  private sharedListComposerSurface(surfaceId: string): Composition {
    return {
      version: 1,
      surfaceId,
      intent: "Create a shared list",
      root: {
        id: "list",
        component: "coordination/shared-list",
        semanticRole: "input/shared-list",
        events: ["listCreated"],
        props: { mode: "compose" },
      },
    };
  }

  private splitBillSurface(surfaceId: string): Composition {
    return {
      version: 1,
      surfaceId,
      intent: "Split a bill",
      root: {
        id: "split",
        component: "commerce/split-bill",
        semanticRole: "input/split-bill",
        events: ["splitProposed"],
        props: { defaultLabel: "Dinner" },
      },
    };
  }

  private tttSurface(surfaceId: string, board: Array<"X" | "O" | null>): Composition {
    return {
      version: 1,
      surfaceId,
      intent: "Play tic-tac-toe",
      root: {
        id: "game",
        component: "games/tictactoe",
        semanticRole: "input/game-board",
        props: {
          gameId: surfaceId,
          board,
          turn: "X",
          status: "active",
          myMark: "X",
        },
        events: ["tttStart", "tttMove"],
      },
    };
  }

  private scheduleSlots(
    surfaceId: string,
    slots: DemoSlotOption[],
    calendarConnected: boolean,
  ): Composition {
    return {
      version: 1,
      surfaceId,
      intent: "Choose a standup time",
      root: {
        id: "root",
        component: "core/card",
        props: { title: "Team standup", subtitle: "Weekly · 30 min · Zoom link on confirm" },
        children: [
          {
            id: "slots",
            component: "core/choice",
            semanticRole: "input/choice",
            events: ["selected"],
            props: {
              options: slots.map((slot) => ({
                id: slot.id,
                label: slot.label,
                description: slot.description,
                ...(slot.recommended ? { recommended: true } : {}),
              })),
            },
          },
          {
            id: "note",
            component: "core/status",
            props: {
              text: calendarConnected
                ? "Availability from your WebCal feed (agent vault)."
                : "Connect your calendar in step 3 to see real busy/free times.",
              tone: calendarConnected ? "success" : "info",
            },
          },
        ],
      },
    };
  }

  // --- RSVP design review ---

  private runRsvpScenario(): void {
    const surfaceId = this.nextSurfaceId();
    this.later(300, () =>
      this.emit({
        type: "text",
        text: "Design review invite from Alex — Thu 10 Jul, 15:00, Room 3 / Zoom.",
      }),
    );
    this.later(1000, () =>
      this.emit({ type: "composition", composition: this.rsvpSurface(surfaceId) }),
    );
    this.later(1100, () => this.finishTurn());
  }

  private rsvpSurface(surfaceId: string): Composition {
    return {
      version: 1,
      surfaceId,
      intent: "RSVP to design review",
      root: {
        id: "root",
        component: "core/card",
        props: {
          title: "Design review — shell v1 contracts",
          subtitle: "Thu 10 Jul · 15:00–16:00 · hosted by Alex",
        },
        children: [
          {
            id: "rsvp",
            component: "core/choice",
            semanticRole: "input/choice",
            events: ["selected"],
            props: {
              options: [
                { id: "rsvp-yes", label: "Yes, I'll attend", recommended: true },
                { id: "rsvp-maybe", label: "Maybe" },
                { id: "rsvp-no", label: "No, decline" },
              ],
            },
          },
        ],
      },
    };
  }

  private scheduleConfirmation(step: PendingStep & { kind: "slot" }): ConsequentialAction {
    return {
      id: `sched-${step.slotId}`,
      kind: "confirmation",
      title: "Schedule team standup",
      terms: {
        event: step.eventTitle,
        when: step.slotLabel,
        start: step.start,
        end: step.end,
        action: "Open Google Calendar to add this event to your calendar",
      },
      confirmLabel: "Add to calendar",
      declineLabel: "Cancel",
    };
  }

  private rsvpConfirmation(response: string): ConsequentialAction {
    return {
      id: "rsvp-design-review",
      kind: "confirmation",
      title: "Update RSVP",
      terms: {
        event: "Design review — shell v1 contracts",
        when: "Thu 10 Jul · 15:00–16:00",
        response,
        action: "Send RSVP to organizer and update your calendar",
      },
      confirmLabel: "Confirm RSVP",
      declineLabel: "Cancel",
    };
  }

  private receipt(actionId: string): Composition {
    return {
      version: 1,
      surfaceId: this.nextSurfaceId(),
      intent: "Calendar confirmation",
      root: {
        id: "root",
        component: "core/card",
        props: { title: "Calendar updated", subtitle: `Ref ${actionId}` },
        children: [
          {
            id: "summary",
            component: "core/table",
            props: {
              columns: ["Field", "Value"],
              rows: [
                ["Status", "Confirmed"],
                ["Attestation", "Recorded in shell log"],
                ["Counterpart", "Mock scheduling agent"],
              ],
            },
          },
        ],
      },
    };
  }

  // --- Spending fallback (module missing → semantic-role fallback) ---

  private runSpendingScenario(): void {
    const surfaceId = this.nextSurfaceId();
    this.later(300, () => this.emit({ type: "text", text: "Pulling your last three months of spending…" }));
    this.later(1200, () =>
      this.emit({ type: "composition", composition: this.spendingSurface(surfaceId) }),
    );
    this.later(1300, () =>
      this.emit({
        type: "text",
        text: "finance/spend-chart isn't installed — watch semantic-role fallback to core/chart.",
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
            id: "note",
            component: "core/status",
            props: { text: "Module unavailable — shell-rendered fallback.", tone: "warn" },
          },
        ],
      },
    };
  }
}
