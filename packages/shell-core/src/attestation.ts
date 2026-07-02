import type { ConsequentialAction, JsonObject } from "./types.js";

/**
 * Local append-only record of what the user saw and decided at each action
 * of consequence (D010). UI-layer application of the local-signed-log
 * pattern from the ledger doc. v1: hash-chained, unsigned, in-memory with
 * an optional persistence hook.
 */
export interface AttestationEntry {
  seq: number;
  timestamp: number;
  surfaceId: string;
  action: ConsequentialAction;
  /** Exactly the terms displayed in shell chrome at decision time. */
  displayedTerms: JsonObject;
  decision: "approved" | "declined";
  /** SHA-256 over (previous hash + this entry's content). Tamper-evident chain. */
  hash: string;
  previousHash: string;
}

const GENESIS_HASH = "0".repeat(64);

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class AttestationLog {
  private entries: AttestationEntry[] = [];
  private persist?: (entries: readonly AttestationEntry[]) => void;

  constructor(options?: {
    persist?: (entries: readonly AttestationEntry[]) => void;
    restore?: AttestationEntry[];
  }) {
    this.persist = options?.persist;
    if (options?.restore) this.entries = [...options.restore];
  }

  async append(record: {
    surfaceId: string;
    action: ConsequentialAction;
    decision: "approved" | "declined";
  }): Promise<AttestationEntry> {
    const previousHash = this.entries.at(-1)?.hash ?? GENESIS_HASH;
    const body = {
      seq: this.entries.length,
      timestamp: Date.now(),
      surfaceId: record.surfaceId,
      action: record.action,
      displayedTerms: record.action.terms,
      decision: record.decision,
    };
    const hash = await sha256Hex(previousHash + JSON.stringify(body));
    const entry: AttestationEntry = { ...body, hash, previousHash };
    this.entries.push(entry);
    this.persist?.(this.entries);
    return entry;
  }

  /** Recompute the chain; returns the seq of the first tampered entry, or null. */
  async verify(): Promise<number | null> {
    let previousHash = GENESIS_HASH;
    for (const entry of this.entries) {
      const { hash, previousHash: claimed, ...body } = entry;
      if (claimed !== previousHash) return entry.seq;
      const expected = await sha256Hex(previousHash + JSON.stringify(body));
      if (expected !== hash) return entry.seq;
      previousHash = hash;
    }
    return null;
  }

  list(): readonly AttestationEntry[] {
    return this.entries;
  }
}
