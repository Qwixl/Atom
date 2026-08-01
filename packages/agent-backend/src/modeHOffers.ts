/**
 * BUS-01 Mode H — pending Checkout offers + outcome mint idempotency.
 */
import type { MonetaryAmount } from "@qwixl/a2a-transport";
import { resolveDataPath } from "./dataDir.js";
import { createJsonStoreWriter, loadJsonStore } from "./persistedJsonStore.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";
import { ABUSE_DEFAULTS } from "./commerceAbuse.js";

const MODE_H_OFFERS_FILE = "mode-h-offers.json";
const SCHEMA_VERSION = 1;

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
}

export class ModeHOfferStore {
  static readonly storeMeta = AGENT_STORE_REGISTRY.modeHOffers;

  private readonly bySession = new Map<string, ModeHPendingOffer>();
  private readonly byOffer = new Map<string, ModeHPendingOffer>();
  private readonly filePath: string;
  private readonly writer: ReturnType<typeof createJsonStoreWriter<ModeHOffersFile>>;

  constructor(filePath = resolveDataPath(MODE_H_OFFERS_FILE)) {
    this.filePath = filePath;
    this.writer = createJsonStoreWriter<ModeHOffersFile>(
      this.filePath,
      SCHEMA_VERSION,
      "mode-h-offers",
      () => ({ offers: this.list() }),
    );
  }

  async load(): Promise<void> {
    await loadJsonStore<ModeHOffersFile>(this.filePath, (file) => {
      this.bySession.clear();
      this.byOffer.clear();
      for (const offer of file?.offers ?? []) {
        this.index(offer);
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

  private evictExpired(): void {
    const now = Date.now();
    for (const offer of [...this.byOffer.values()]) {
      const expired =
        (offer.optionExpiresAt && Date.parse(offer.optionExpiresAt) <= now) ||
        (offer.outcomeMintedAt &&
          Date.parse(offer.outcomeMintedAt) <= now - 7 * 24 * 60 * 60 * 1000);
      if (expired) {
        this.byOffer.delete(offer.offerId);
        this.bySession.delete(offer.checkoutSessionId);
      }
    }
  }

  /** Pre-check before Stripe mint (BUS-ABUSE-01 F-6). */
  assertCanAcceptPending(): void {
    this.evictExpired();
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
  }
}
