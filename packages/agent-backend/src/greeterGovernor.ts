/**
 * Cap concurrent NPC greeters per place-entry event (D087 / AS-06).
 * Hard infra limit — not prompt-only.
 */

export const DEFAULT_GREETER_CAP = 3;

export interface GreeterSlotResult {
  allowed: boolean;
  reason: "granted" | "cap_reached" | "already_greeted" | "expired_or_missing";
  activeCount: number;
}

interface PlaceEntryEvent {
  placeId: string;
  humanDid: string;
  startedAt: number;
  greeterDids: Set<string>;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export class GreeterGovernor {
  private readonly cap: number;
  private readonly ttlMs: number;
  private readonly events = new Map<string, PlaceEntryEvent>();

  constructor(options?: { cap?: number; ttlMs?: number }) {
    this.cap = Math.max(1, Math.min(3, options?.cap ?? DEFAULT_GREETER_CAP));
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  }

  private key(placeId: string, humanDid: string): string {
    return `${placeId.trim().toLowerCase()}::${humanDid.trim()}`;
  }

  private purgeExpired(now = Date.now()): void {
    for (const [key, event] of this.events) {
      if (now - event.startedAt > this.ttlMs) this.events.delete(key);
    }
  }

  /** Start or refresh a place-entry window for a human. */
  noteHumanEntered(placeId: string, humanDid: string, now = Date.now()): void {
    this.purgeExpired(now);
    const key = this.key(placeId, humanDid);
    const existing = this.events.get(key);
    if (existing) {
      existing.startedAt = now;
      return;
    }
    this.events.set(key, {
      placeId,
      humanDid,
      startedAt: now,
      greeterDids: new Set(),
    });
  }

  /**
   * Ask whether this NPC may greet/address the human for the current entry event.
   * On grant, records the NPC so later NPCs are denied once the cap is hit.
   */
  tryClaimGreeter(placeId: string, humanDid: string, npcDid: string, now = Date.now()): GreeterSlotResult {
    this.purgeExpired(now);
    const key = this.key(placeId, humanDid);
    let event = this.events.get(key);
    if (!event) {
      this.noteHumanEntered(placeId, humanDid, now);
      event = this.events.get(key)!;
    }
    if (event.greeterDids.has(npcDid)) {
      return { allowed: false, reason: "already_greeted", activeCount: event.greeterDids.size };
    }
    if (event.greeterDids.size >= this.cap) {
      return { allowed: false, reason: "cap_reached", activeCount: event.greeterDids.size };
    }
    event.greeterDids.add(npcDid);
    return { allowed: true, reason: "granted", activeCount: event.greeterDids.size };
  }

  activeGreeterCount(placeId: string, humanDid: string, now = Date.now()): number {
    this.purgeExpired(now);
    return this.events.get(this.key(placeId, humanDid))?.greeterDids.size ?? 0;
  }

  /** Test / ops helper. */
  clear(): void {
    this.events.clear();
  }
}

/** Process-wide governor for community hosts (one per agent-backend process). */
export const sharedGreeterGovernor = new GreeterGovernor();
