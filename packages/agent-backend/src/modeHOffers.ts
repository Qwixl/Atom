/**
 * BUS-01 Mode H — pending Checkout offers + outcome mint idempotency.
 * BUS-01-HOLD-EVICT — hold quarantine survives pending-row eviction.
 */
import type { MonetaryAmount } from "@qwixl/a2a-transport";
import { resolveDataPath } from "./dataDir.js";
import { createJsonStoreWriter, loadJsonStore } from "./persistedJsonStore.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";
import { ABUSE_DEFAULTS } from "./commerceAbuse.js";

const MODE_H_OFFERS_FILE = "mode-h-offers.json";
const SCHEMA_VERSION = 1;
/** After option expiry (or now if missing), keep subject in hold quarantine this long. */
const HOLD_QUARANTINE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface ModeHPendingOffer {
  offerId: string;
  intentId: string;
  checkoutSessionId: string;
  amount: MonetaryAmount;
  label: string;
  buyerPeerUrl: string;
  buyerDid?: string;
  createdAt: string;
  optionExpiresAt?: string;
  checkoutUrl?: string;
  /** Set when merchant-signed commerce:outcome was delivered. */
  outcomeMintedAt?: string;
  stripeEventIds?: string[];
}

interface ModeHOffersFile {
  schemaVersion: number;
  offers: ModeHPendingOffer[];
  /** subjectId → ISO expire-at for hold quarantine after pending-row eviction. */
  holdQuarantine?: Record<string, string>;
}

export class ModeHOfferStore {
  static readonly storeMeta = AGENT_STORE_REGISTRY.modeHOffers;

  private readonly bySession = new Map<string, ModeHPendingOffer>();
  private readonly byOffer = new Map<string, ModeHPendingOffer>();
  /** subject id → epoch ms until which holds must be refused. */
  private readonly holdQuarantine = new Map<string, number>();
  private readonly filePath: string;
  private readonly writer: ReturnType<typeof createJsonStoreWriter<ModeHOffersFile>>;

  constructor(filePath = resolveDataPath(MODE_H_OFFERS_FILE)) {
    this.filePath = filePath;
    this.writer = createJsonStoreWriter<ModeHOffersFile>(
      this.filePath,
      SCHEMA_VERSION,
      "mode-h-offers",
      () => this.snapshot(),
    );
  }

  private snapshot(): Omit<ModeHOffersFile, "schemaVersion"> {
    this.pruneExpiredQuarantine();
    const holdQuarantine: Record<string, string> = {};
    for (const [id, until] of this.holdQuarantine) {
      holdQuarantine[id] = new Date(until).toISOString();
    }
    return { offers: this.list(), holdQuarantine };
  }

  async load(): Promise<void> {
    await loadJsonStore<ModeHOffersFile>(this.filePath, (file) => {
      this.bySession.clear();
      this.byOffer.clear();
      this.holdQuarantine.clear();
      for (const offer of file?.offers ?? []) {
        this.index(offer);
      }
      const now = Date.now();
      for (const [id, iso] of Object.entries(file?.holdQuarantine ?? {})) {
        const until = Date.parse(iso);
        if (Number.isFinite(until) && until > now) {
          const prev = this.holdQuarantine.get(id) ?? 0;
          if (until > prev) this.holdQuarantine.set(id, until);
        }
      }
    });
  }

  list(): ModeHPendingOffer[] {
    return [...this.byOffer.values()];
  }

  getBySessionId(checkoutSessionId: string): ModeHPendingOffer | undefined {
    return this.bySession.get(checkoutSessionId);
  }

  getByOfferId(offerId: string): ModeHPendingOffer | undefined {
    return this.byOffer.get(offerId);
  }

  /**
   * BUS-01-HOLD-GATE / HOLD-EVICT — true while active pending row exists or
   * subject remains in post-eviction hold quarantine (offerId, checkoutSessionId, intentId).
   */
  isHoldSubject(subjectId: string): boolean {
    const id = subjectId.trim();
    if (!id) return false;
    if (this.byOffer.has(id) || this.bySession.has(id)) return true;
    const until = this.holdQuarantine.get(id);
    if (until === undefined) return false;
    if (until <= Date.now()) {
      this.holdQuarantine.delete(id);
      return false;
    }
    return true;
  }

  upsert(offer: ModeHPendingOffer): void {
    this.assertCanAcceptPending();
    if (this.byOffer.has(offer.offerId)) {
      this.index(offer);
      this.writer.persist();
      return;
    }
    this.index(offer);
    this.writer.persist();
  }

  async flush(): Promise<void> {
    await this.writer.flush();
  }

  private quarantineUntil(offer: ModeHPendingOffer): number {
    const parsed = offer.optionExpiresAt ? Date.parse(offer.optionExpiresAt) : NaN;
    const base = Number.isFinite(parsed) ? parsed : Date.now();
    return base + HOLD_QUARANTINE_AFTER_MS;
  }

  private rememberHoldSubjects(offer: ModeHPendingOffer): void {
    const until = this.quarantineUntil(offer);
    for (const id of [offer.offerId, offer.checkoutSessionId, offer.intentId]) {
      const key = id?.trim();
      if (!key) continue;
      const prev = this.holdQuarantine.get(key) ?? 0;
      if (until > prev) this.holdQuarantine.set(key, until);
    }
  }

  private pruneExpiredQuarantine(): void {
    const now = Date.now();
    for (const [id, until] of this.holdQuarantine) {
      if (until <= now) this.holdQuarantine.delete(id);
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const offer of [...this.byOffer.values()]) {
      const expired =
        (offer.optionExpiresAt && Date.parse(offer.optionExpiresAt) <= now) ||
        (offer.outcomeMintedAt &&
          Date.parse(offer.outcomeMintedAt) <= now - 7 * 24 * 60 * 60 * 1000);
      if (expired) {
        this.rememberHoldSubjects(offer);
        this.byOffer.delete(offer.offerId);
        this.bySession.delete(offer.checkoutSessionId);
      }
    }
  }

  /** Pre-check before Stripe mint (BUS-ABUSE-01 F-6). */
  assertCanAcceptPending(): void {
    this.evictExpired();
    this.pruneExpiredQuarantine();
    const maxPending = Number(
      process.env.ATOM_MODE_H_PENDING_MAX?.trim() || String(ABUSE_DEFAULTS.pendingOfferMax),
    );
    if (this.byOffer.size >= (Number.isFinite(maxPending) ? maxPending : 200)) {
      throw new Error("Mode H pending offer cap reached — refusing new Checkout Session row");
    }
  }

  markOutcomeMinted(
    checkoutSessionId: string,
    stripeEventId?: string,
  ): ModeHPendingOffer | undefined {
    const existing = this.bySession.get(checkoutSessionId);
    if (!existing) return undefined;
    const eventIds = new Set(existing.stripeEventIds ?? []);
    if (stripeEventId) eventIds.add(stripeEventId);
    const updated: ModeHPendingOffer = {
      ...existing,
      outcomeMintedAt: existing.outcomeMintedAt ?? new Date().toISOString(),
      stripeEventIds: [...eventIds],
    };
    this.index(updated);
    this.writer.persist();
    return updated;
  }

  hasProcessedEvent(stripeEventId: string): boolean {
    for (const offer of this.byOffer.values()) {
      if (offer.stripeEventIds?.includes(stripeEventId)) return true;
    }
    return false;
  }

  private index(offer: ModeHPendingOffer): void {
    this.bySession.set(offer.checkoutSessionId, offer);
    this.byOffer.set(offer.offerId, offer);
    this.rememberHoldSubjects(offer);
  }
}
