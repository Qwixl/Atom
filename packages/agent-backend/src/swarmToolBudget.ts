/**
 * Fair-use budgets for swarm NPC tools (D089).
 * In-process counters — sufficient for single-process NPC backends.
 */

export const SWARM_SEARCH_TOOL_NAMES = ["news_search", "page_read"] as const;
export type SwarmSearchToolName = (typeof SWARM_SEARCH_TOOL_NAMES)[number];

export const SWARM_MEMORY_REMEMBER_TOOL = "memory_remember";
export const SWARM_INVITE_FRIEND_TOOL = "invite_friend_to_room";
export const SWARM_CHALLENGE_GAME_TOOL = "challenge_friend_to_game";

/** Registry + in-process tools exposed to swarm NPCs. */
export const SWARM_ALLOWED_TOOL_NAMES = [
  ...SWARM_SEARCH_TOOL_NAMES,
  SWARM_MEMORY_REMEMBER_TOOL,
  SWARM_INVITE_FRIEND_TOOL,
  SWARM_CHALLENGE_GAME_TOOL,
] as const;

export interface SwarmToolBudgetLimits {
  searchPerHour: number;
  searchPerDay: number;
  maxToolRoundsPerTurn: number;
}

export const DEFAULT_SWARM_TOOL_BUDGET: SwarmToolBudgetLimits = {
  searchPerHour: 20,
  searchPerDay: 60,
  maxToolRoundsPerTurn: 2,
};

interface WindowCount {
  count: number;
  resetAt: number;
}

function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export class SwarmToolBudget {
  private readonly limits: SwarmToolBudgetLimits;
  private hour: WindowCount | null = null;
  private dayKey = "";
  private dayCount = 0;

  constructor(limits: Partial<SwarmToolBudgetLimits> = {}) {
    this.limits = { ...DEFAULT_SWARM_TOOL_BUDGET, ...limits };
  }

  get maxToolRoundsPerTurn(): number {
    return this.limits.maxToolRoundsPerTurn;
  }

  /** Whether a search tool may run now. Memory tools are not rate-limited here. */
  tryConsumeSearch(toolName: string, nowMs = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
    if (!SWARM_SEARCH_TOOL_NAMES.includes(toolName as SwarmSearchToolName)) {
      return { ok: true };
    }
    const hourMs = 3_600_000;
    if (!this.hour || this.hour.resetAt <= nowMs) {
      this.hour = { count: 0, resetAt: nowMs + hourMs };
    }
    const day = utcDayKey(nowMs);
    if (this.dayKey !== day) {
      this.dayKey = day;
      this.dayCount = 0;
    }
    if (this.hour.count >= this.limits.searchPerHour) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((this.hour.resetAt - nowMs) / 1000)) };
    }
    if (this.dayCount >= this.limits.searchPerDay) {
      const tomorrow = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((tomorrow - nowMs) / 1000)) };
    }
    this.hour.count += 1;
    this.dayCount += 1;
    return { ok: true };
  }
}

/** Shared process-wide budget for the NPC agent instance. */
let sharedBudget: SwarmToolBudget | null = null;

export function sharedSwarmToolBudget(): SwarmToolBudget {
  if (!sharedBudget) sharedBudget = new SwarmToolBudget();
  return sharedBudget;
}

/** Test helper. */
export function resetSharedSwarmToolBudget(limits?: Partial<SwarmToolBudgetLimits>): SwarmToolBudget {
  sharedBudget = new SwarmToolBudget(limits);
  return sharedBudget;
}
