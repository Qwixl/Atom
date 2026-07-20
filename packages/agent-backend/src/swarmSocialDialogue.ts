/**
 * NPC↔NPC autonomous dialogue state (D091).
 * Caps: min 4 / max 12 messages per conversation; openers + pair cooldowns.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "./dataDir.js";

export const SOCIAL_MIN_MESSAGES = 4;
export const SOCIAL_MAX_MESSAGES = 12;
/** Hours before the same pair may open again. */
export const SOCIAL_PAIR_COOLDOWN_HOURS = 48;

export interface SocialDialogueRecord {
  peerDid: string;
  peerLabel?: string;
  role: "initiator" | "invitee";
  /** Messages we have sent in this dialogue. */
  sentByUs: number;
  /** Messages received from the peer in this dialogue. */
  sentByThem: number;
  status: "active" | "closed";
  startedAt: string;
  updatedAt: string;
}

interface SocialFile {
  schemaVersion: 1;
  dialogues: SocialDialogueRecord[];
  /** UTC day key → openers started that day. */
  openersByDay: Record<string, number>;
  /** peerDid → ISO timestamp when last dialogue closed. */
  cooldowns: Record<string, string>;
}

const GOODBYE_RE =
  /\b(goodbye|good bye|bye\b|talk soon|catch you later|see you( later| around)?|gotta go|i should go|until next time)\b/i;

function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function looksLikeGoodbye(text: string): boolean {
  return GOODBYE_RE.test(text.trim());
}

export function socialMessageTotal(d: SocialDialogueRecord): number {
  return d.sentByUs + d.sentByThem;
}

/** Prompt guidance for the message we are about to send (1-based next total). */
export function formatSocialTurnBudget(nextTotal: number): string {
  if (nextTotal < SOCIAL_MIN_MESSAGES) {
    return `## NPC neighbour chat

This is an autonomous conversation with a community friend (not a human).
You are about to send message ${nextTotal} of at most ${SOCIAL_MAX_MESSAGES}.
You must continue the conversation for now (minimum ${SOCIAL_MIN_MESSAGES} messages total).
Stay in character; keep it to 1–3 short sentences. Do not mention turn counts.`;
  }
  if (nextTotal < SOCIAL_MAX_MESSAGES) {
    return `## NPC neighbour chat

Autonomous conversation with a community friend.
You are about to send message ${nextTotal} of at most ${SOCIAL_MAX_MESSAGES} (minimum ${SOCIAL_MIN_MESSAGES} already reached).
You may continue briefly, or say a warm goodbye and end — either is fine.
If ending, include a clear goodbye. Do not mention turn counts.`;
  }
  return `## NPC neighbour chat

Autonomous conversation with a community friend.
This is message ${SOCIAL_MAX_MESSAGES} of ${SOCIAL_MAX_MESSAGES} — you must say goodbye and end the conversation now.
One short farewell in character. Do not mention turn counts.`;
}

export class SwarmSocialDialogueStore {
  private readonly filePath: string;
  private data: SocialFile = {
    schemaVersion: 1,
    dialogues: [],
    openersByDay: {},
    cooldowns: {},
  };

  constructor(filePath = resolveDataPath("swarm-social.json")) {
    this.filePath = filePath;
  }

  load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as SocialFile;
      if (raw?.schemaVersion === 1) {
        this.data = {
          schemaVersion: 1,
          dialogues: Array.isArray(raw.dialogues) ? raw.dialogues : [],
          openersByDay: raw.openersByDay && typeof raw.openersByDay === "object" ? raw.openersByDay : {},
          cooldowns: raw.cooldowns && typeof raw.cooldowns === "object" ? raw.cooldowns : {},
        };
      }
    } catch {
      /* start fresh */
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
  }

  getActive(peerDid: string): SocialDialogueRecord | null {
    const did = peerDid.trim();
    return (
      this.data.dialogues.find((d) => d.peerDid === did && d.status === "active") ?? null
    );
  }

  listActive(): SocialDialogueRecord[] {
    return this.data.dialogues.filter((d) => d.status === "active");
  }

  openersToday(now = Date.now()): number {
    return this.data.openersByDay[utcDayKey(now)] ?? 0;
  }

  isOnCooldown(peerDid: string, now = Date.now()): boolean {
    const at = this.data.cooldowns[peerDid.trim()];
    if (!at) return false;
    const elapsed = now - Date.parse(at);
    return Number.isFinite(elapsed) && elapsed < SOCIAL_PAIR_COOLDOWN_HOURS * 3_600_000;
  }

  canStartOpener(peerDid: string, now = Date.now()): { ok: true } | { ok: false; reason: string } {
    if (this.listActive().length > 0) {
      return { ok: false, reason: "already_in_dialogue" };
    }
    if (this.openersToday(now) >= 1) {
      return { ok: false, reason: "opener_daily_cap" };
    }
    if (this.isOnCooldown(peerDid, now)) {
      return { ok: false, reason: "pair_cooldown" };
    }
    return { ok: true };
  }

  startDialogue(
    peerDid: string,
    role: "initiator" | "invitee",
    opts?: { peerLabel?: string; sentByUs?: number; sentByThem?: number },
  ): SocialDialogueRecord {
    const did = peerDid.trim();
    const now = new Date().toISOString();
    // Close any stale active with this peer.
    for (const d of this.data.dialogues) {
      if (d.peerDid === did && d.status === "active") {
        d.status = "closed";
        d.updatedAt = now;
      }
    }
    const row: SocialDialogueRecord = {
      peerDid: did,
      peerLabel: opts?.peerLabel,
      role,
      sentByUs: opts?.sentByUs ?? 0,
      sentByThem: opts?.sentByThem ?? 0,
      status: "active",
      startedAt: now,
      updatedAt: now,
    };
    this.data.dialogues.push(row);
    if (role === "initiator") {
      const day = utcDayKey();
      this.data.openersByDay[day] = (this.data.openersByDay[day] ?? 0) + 1;
    }
    // Cap history
    if (this.data.dialogues.length > 200) {
      this.data.dialogues = this.data.dialogues.slice(-200);
    }
    this.persist();
    return row;
  }

  noteInbound(peerDid: string): SocialDialogueRecord | null {
    const d = this.getActive(peerDid);
    if (!d) return null;
    d.sentByThem += 1;
    d.updatedAt = new Date().toISOString();
    this.persist();
    return d;
  }

  noteOutbound(peerDid: string): SocialDialogueRecord | null {
    const d = this.getActive(peerDid);
    if (!d) return null;
    d.sentByUs += 1;
    d.updatedAt = new Date().toISOString();
    this.persist();
    return d;
  }

  closeDialogue(peerDid: string): void {
    const did = peerDid.trim();
    const now = new Date().toISOString();
    const d = this.getActive(did);
    if (d) {
      d.status = "closed";
      d.updatedAt = now;
    }
    this.data.cooldowns[did] = now;
    this.persist();
  }

  snapshot(): {
    active: SocialDialogueRecord[];
    openersToday: number;
    cooldowns: Record<string, string>;
  } {
    return {
      active: this.listActive(),
      openersToday: this.openersToday(),
      cooldowns: { ...this.data.cooldowns },
    };
  }
}
