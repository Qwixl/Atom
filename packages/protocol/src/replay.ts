import { resolveExpiry } from "./governance.js";
import type { DataObjectGovernance } from "./types.js";

/**
 * Replay rejection for Governed Objects (draft {{replay}}).
 *
 * A Relying Receiver MUST reject an object whose `id` it has previously accepted
 * from the same `issuerDid`. Retention should cover at least the maximum object
 * lifetime the receiver will accept.
 *
 * That last sentence is what bounds this structure. An object past its expiry is
 * refused on expiry grounds before it ever reaches the guard, so remembering it
 * beyond that point buys nothing — retention is per-entry and derived from the
 * object's own governance. Objects that declare no expiry have no such bound and
 * fall back to `defaultRetentionMs`.
 */

/** Applies when an object declares neither `ttlSeconds` nor `expiresAt`. */
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Held past expiry to absorb a backwards clock step. Expiry is evaluated against
 * this same process clock, so no allowance for peer skew is needed — only for
 * our own clock moving under us between the two checks.
 */
const RETENTION_MARGIN_MS = 5 * 60 * 1000;
/** Backstop against memory growth; evicts soonest-to-expire first. */
const DEFAULT_MAX_ENTRIES = 100_000;
/** Admits between full sweeps, so the common path stays O(1). */
const SWEEP_INTERVAL = 512;

export interface ReplayGuardOptions {
  defaultRetentionMs?: number;
  maxEntries?: number;
}

export interface ReplayGuardEntry {
  key: string;
  expiresAt: number;
}

export interface ReplayGuardSnapshot {
  version: 1;
  entries: ReplayGuardEntry[];
}

/** The shape `verifyDataObject` hands to `admit`; governance may be absent. */
interface AdmittableObject {
  issuerDid: string;
  id: string;
  issuedAt?: string;
  governance?: DataObjectGovernance;
}

export class ReplayGuard {
  #seen = new Map<string, number>();
  #sinceSweep = 0;
  #admissions = 0;
  readonly #defaultRetentionMs: number;
  readonly #maxEntries: number;

  constructor(options: ReplayGuardOptions = {}) {
    this.#defaultRetentionMs = options.defaultRetentionMs ?? DEFAULT_RETENTION_MS;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  static key(issuerDid: string, id: string): string {
    return `${issuerDid}\u0000${id}`;
  }

  /** True when this `(issuerDid, id)` has not been admitted before. */
  admit(object: AdmittableObject, now: number = Date.now()): boolean {
    const key = ReplayGuard.key(object.issuerDid, object.id);
    const held = this.#seen.get(key);
    if (held !== undefined && held > now) return false;

    this.#seen.set(key, this.#retainUntil(object, now));
    this.#admissions += 1;
    if (++this.#sinceSweep >= SWEEP_INTERVAL) this.#sweep(now);
    if (this.#seen.size > this.#maxEntries) this.#evictOldest();
    return true;
  }

  /**
   * Monotonic count of admitted objects. Lets a persistence layer tell "nothing
   * happened" from "the same number of entries happen to be held", so an idle
   * agent is not rewriting an identical snapshot forever.
   */
  get admissions(): number {
    return this.#admissions;
  }

  has(object: AdmittableObject, now: number = Date.now()): boolean {
    const held = this.#seen.get(ReplayGuard.key(object.issuerDid, object.id));
    return held !== undefined && held > now;
  }

  get size(): number {
    return this.#seen.size;
  }

  /** Live entries, for persistence across restarts. */
  snapshot(now: number = Date.now()): ReplayGuardSnapshot {
    this.#sweep(now);
    return {
      version: 1,
      entries: [...this.#seen.entries()].map(([key, expiresAt]) => ({ key, expiresAt })),
    };
  }

  /**
   * Merge a snapshot in, keeping the later expiry when an entry is already held.
   * Merging rather than replacing means a restore can never shorten protection
   * that the running process has already committed to.
   */
  restore(snapshot: ReplayGuardSnapshot, now: number = Date.now()): void {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported replay guard snapshot version ${snapshot.version}`);
    }
    for (const entry of snapshot.entries) {
      if (entry.expiresAt <= now) continue;
      const held = this.#seen.get(entry.key);
      if (held === undefined || entry.expiresAt > held) {
        this.#seen.set(entry.key, entry.expiresAt);
      }
    }
    if (this.#seen.size > this.#maxEntries) this.#evictOldest();
  }

  #retainUntil(object: AdmittableObject, now: number): number {
    if (object.governance && object.issuedAt) {
      try {
        const expiry = resolveExpiry(object.governance, object.issuedAt);
        // A short TTL is not a way to shorten the replay window: once expiry
        // passes, the object is refused as expired regardless of this guard, so
        // covering exactly the usable lifetime is sufficient.
        if (expiry) return expiry.getTime() + RETENTION_MARGIN_MS;
      } catch {
        // Malformed governance is the verifier's problem, not the guard's.
      }
    }
    return now + this.#defaultRetentionMs;
  }

  #sweep(now: number): void {
    this.#sinceSweep = 0;
    for (const [key, expiresAt] of this.#seen) {
      if (expiresAt <= now) this.#seen.delete(key);
    }
  }

  #evictOldest(): void {
    const excess = this.#seen.size - this.#maxEntries;
    if (excess <= 0) return;
    const byExpiry = [...this.#seen.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < excess; i += 1) {
      const entry = byExpiry[i];
      if (entry) this.#seen.delete(entry[0]);
    }
  }
}
