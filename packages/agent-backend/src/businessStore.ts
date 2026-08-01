import {
  COMMERCE_OFFER_PURPOSE,
  COMMERCE_OUTCOME_PURPOSE,
  COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
  createCommerceDecline,
  createCommerceIntent,
  createCommerceOffer,
  createCommerceOutcome,
  verifyCommerceIntent,
  verifyCommerceOffer,
  verifyCommerceOutcome,
  type CommerceIntentPayload,
  type CommerceOfferPayload,
} from "@qwixl/a2a-transport";
import { matchCatalogForIntent } from "@qwixl/owner-store";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { BusinessCatalogStore } from "./businessCatalogStore.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";
import { resolveDataPath } from "./dataDir.js";
import { createJsonStoreWriter, loadJsonStore } from "./persistedJsonStore.js";
import { assertHostedBusinessCommerceEligible } from "./commerceEligibility.js";
import { getConnectAccount } from "./connectAccounts.js";
import { createModeHCheckoutSession } from "./payment/modeHCheckout.js";
import { ModeHOfferStore } from "./modeHOffers.js";
import {
  CommerceAbuseError,
  CommerceAbuseStore,
  commerceAbuseStore,
} from "./commerceAbuse.js";
import {
  paymentIntentIdFromSession,
  type StripeCheckoutSessionObject,
} from "./payment/stripeWebhook.js";

const COMMERCE_INTENTS_FILE = "commerce-intents.json";
const SCHEMA_VERSION = 1;

interface CommerceIntentsFile {
  schemaVersion: number;
  intents: CommerceIntentPayload[];
}

export interface BusinessStoreDeps {
  localDid: string;
  identity: AgentKeyPair;
  mlsStore: MlsSessionStore;
  catalog: BusinessCatalogStore;
  businessMode: boolean;
  /** Platform Stripe secret for Mode H Checkout-on-Connect (BUS-01). */
  stripeSecretKey?: string | null;
  /** Default workspace id for Connect account lookup. */
  commerceWorkspaceId?: string | null;
  checkoutSuccessUrl?: string | null;
  checkoutCancelUrl?: string | null;
  /** Buy-option TTL seconds (default 24h, capped by Stripe Session). */
  optionTtlSeconds?: number;
  /** BUS-ABUSE-01 counters (default process store). */
  abuse?: CommerceAbuseStore;
  /** Buyer: record spend when verified commerce:outcome arrives. */
  onCommerceOutcomePaid?: (input: {
    amountMinor: number;
    currency: string;
    description: string;
    offerId: string;
    checkoutSessionId: string;
  }) => void;
  /** Suggest-mute chrome signal (2A). */
  onSuggestMute?: (peerDid: string) => void;
}

export class BusinessStore {
  static readonly storeMeta = AGENT_STORE_REGISTRY.commerceIntents;
  private readonly intents = new Map<string, CommerceIntentPayload>();
  /** Buyer-side cache of inbound Mode H offers for outcome binding (design §4.3). */
  private readonly inboundOffers = new Map<
    string,
    { merchantDid: string; payload: CommerceOfferPayload }
  >();
  private readonly filePath: string;
  private readonly writer: ReturnType<typeof createJsonStoreWriter<CommerceIntentsFile>>;
  private readonly modeHOffers: ModeHOfferStore;
  private outcomeMintInFlight = new Set<string>();
  /** Buyer: processed offerId:checkoutSessionId — spend ledger idempotency. */
  private readonly processedOutcomes = new Set<string>();
  private readonly abuse: CommerceAbuseStore;

  constructor(
    private readonly deps: BusinessStoreDeps,
    filePath = resolveDataPath(COMMERCE_INTENTS_FILE),
    modeHOffersPath?: string,
  ) {
    this.filePath = filePath;
    this.modeHOffers = new ModeHOfferStore(
      modeHOffersPath ?? resolveDataPath("mode-h-offers.json"),
    );
    this.abuse = deps.abuse ?? commerceAbuseStore;
    this.writer = createJsonStoreWriter<CommerceIntentsFile>(
      this.filePath,
      SCHEMA_VERSION,
      "commerce-intents",
      () => ({ intents: this.listIntents() }),
    );
  }

  async load(): Promise<void> {
    await this.abuse.load();
    await this.modeHOffers.load();
    await loadJsonStore<CommerceIntentsFile>(this.filePath, (file) => {
      this.intents.clear();
      for (const intent of file?.intents ?? []) {
        if (intent.intentId) {
          this.intents.set(intent.intentId, intent);
        }
      }
    });
  }

  listIntents(): CommerceIntentPayload[] {
    return [...this.intents.values()];
  }

  /** BUS-01-HOLD-GATE — subject matches a pending Mode H offer or Checkout Session id. */
  isModeHHoldSubject(subjectId: string): boolean {
    const id = subjectId.trim();
    if (!id) return false;
    return Boolean(this.modeHOffers.getByOfferId(id) || this.modeHOffers.getBySessionId(id));
  }

  async sendIntent(params: {
    payload: CommerceIntentPayload;
    peerUrl?: string;
    peerDid?: string;
    encrypt?: boolean;
  }): Promise<DataObject> {
    this.abuse.assertAgentShoppingOn();
    this.abuse.assertBuyerIntentVelocity(
      this.deps.commerceWorkspaceId?.trim() || process.env.ATOM_WORKSPACE_ID?.trim() || "personal",
    );
    const object = await createCommerceIntent({
      identity: this.deps.identity,
      payload: params.payload,
    });
    this.intents.set(params.payload.intentId, params.payload);
    this.writer.persist();
    if (params.peerUrl?.trim()) {
      await deliverSignedObject({
        mlsStore: this.deps.mlsStore,
        peerUrl: params.peerUrl.trim(),
        peerDid: params.peerDid?.trim(),
        object,
        encrypt: params.encrypt ?? false,
      });
    }
    return object;
  }

  async sendOffer(params: {
    intentId: string;
    catalogItemId: string;
    peerUrl: string;
    peerDid?: string;
    encrypt?: boolean;
  }): Promise<DataObject> {
    assertHostedBusinessCommerceEligible();
    if (params.peerDid?.trim()) {
      this.abuse.assertOfferPairAllowed(this.deps.identity.did, params.peerDid.trim());
    }
    const item = this.deps.catalog.get(params.catalogItemId);
    if (!item) throw new Error(`Unknown catalog item: ${params.catalogItemId}`);
    const offerId = `offer-${params.intentId}-${params.catalogItemId}`;
    const modeH = await this.buildModeHOfferFields({
      offerId,
      intentId: params.intentId,
      label: item.label,
      amountMinor: item.amount.amountMinor,
      currency: item.amount.currency,
    });
    this.rememberPendingOffer({
      offerId,
      intentId: params.intentId,
      checkoutSessionId: modeH.checkoutSessionId,
      amount: item.amount,
      label: item.label,
      buyerPeerUrl: params.peerUrl.trim(),
      buyerDid: params.peerDid?.trim(),
      optionExpiresAt: modeH.optionExpiresAt,
      checkoutUrl: modeH.checkoutUrl,
    });
    const object = await createCommerceOffer({
      identity: this.deps.identity,
      payload: {
        offerId,
        intentId: params.intentId,
        catalogItemId: item.catalogItemId,
        label: item.label,
        amount: item.amount,
        available: item.available,
        terms: item.terms ?? [],
        sponsored: item.sponsored,
        sponsoredRank: item.sponsoredRank,
        peerDid: params.peerDid,
        ...modeH,
      },
      ttlSeconds: Math.max(
        60,
        Math.floor((Date.parse(modeH.optionExpiresAt) - Date.now()) / 1000),
      ),
    });
    await deliverSignedObject({
      mlsStore: this.deps.mlsStore,
      peerUrl: params.peerUrl.trim(),
      peerDid: params.peerDid?.trim(),
      object,
      encrypt: params.encrypt ?? false,
    });
    return object;
  }

  /**
   * Merchant: Stripe Checkout paid → sign commerce:outcome → deliver to buyer.
   */
  async mintOutcomeFromCheckoutPaid(input: {
    eventId: string;
    session: StripeCheckoutSessionObject;
  }): Promise<{ status: "minted" | "duplicate" | "ignored"; detail?: string }> {
    if (this.modeHOffers.hasProcessedEvent(input.eventId)) {
      return { status: "duplicate", detail: "event" };
    }
    const pending = this.modeHOffers.getBySessionId(input.session.id);
    if (!pending) {
      return { status: "ignored", detail: "unknown_session" };
    }
    if (pending.outcomeMintedAt) {
      this.modeHOffers.markOutcomeMinted(input.session.id, input.eventId);
      return { status: "duplicate", detail: "session" };
    }
    if (this.outcomeMintInFlight.has(input.session.id)) {
      return { status: "duplicate", detail: "in_flight" };
    }
    this.outcomeMintInFlight.add(input.session.id);
    try {
      const metaOfferId = input.session.metadata?.offerId ?? input.session.client_reference_id;
      if (metaOfferId && metaOfferId !== pending.offerId) {
        throw new Error("Checkout Session offerId does not match pending Mode H offer");
      }
      const metaIntentId = input.session.metadata?.intentId;
      if (metaIntentId && metaIntentId !== pending.intentId) {
        throw new Error("Checkout Session intentId does not match pending Mode H offer");
      }
      if (
        typeof input.session.amount_total === "number" &&
        input.session.amount_total !== pending.amount.amountMinor
      ) {
        throw new Error("Checkout Session amount_total does not match signed offer");
      }
      if (
        typeof input.session.currency === "string" &&
        input.session.currency.toUpperCase() !== pending.amount.currency.toUpperCase()
      ) {
        throw new Error("Checkout Session currency does not match signed offer");
      }

      // Mark before deliver so concurrent webhooks cannot double-mint (F-10).
      this.modeHOffers.markOutcomeMinted(input.session.id, input.eventId);

      const paidAt = new Date().toISOString();
      const outcome = await createCommerceOutcome({
        identity: this.deps.identity,
        payload: {
          offerId: pending.offerId,
          intentId: pending.intentId,
          checkoutSessionId: pending.checkoutSessionId,
          amount: pending.amount,
          paidAt,
          settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
          stripePaymentIntentId: paymentIntentIdFromSession(input.session),
        },
      });
      await deliverSignedObject({
        mlsStore: this.deps.mlsStore,
        peerUrl: pending.buyerPeerUrl,
        peerDid: pending.buyerDid,
        object: outcome,
        encrypt: false,
      });
      return { status: "minted" };
    } finally {
      this.outcomeMintInFlight.delete(input.session.id);
    }
  }

  private rememberPendingOffer(input: {
    offerId: string;
    intentId: string;
    checkoutSessionId: string;
    amount: { currency: string; amountMinor: number };
    label: string;
    buyerPeerUrl: string;
    buyerDid?: string;
    optionExpiresAt: string;
    checkoutUrl: string;
  }): void {
    this.modeHOffers.upsert({
      ...input,
      createdAt: new Date().toISOString(),
    });
  }

  private async buildModeHOfferFields(input: {
    offerId: string;
    intentId: string;
    label: string;
    amountMinor: number;
    currency: string;
  }): Promise<{
    settlementMode: typeof COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT;
    optionExpiresAt: string;
    checkoutUrl: string;
    checkoutSessionId: string;
  }> {
    const secret = this.deps.stripeSecretKey?.trim();
    if (!secret) throw new Error("Stripe not configured — cannot mint Mode H checkout offer");
    const workspaceId = this.deps.commerceWorkspaceId?.trim() || "default";
    const connect = getConnectAccount(workspaceId);
    if (!connect?.stripeAccountId) {
      throw new Error("Complete Stripe Connect onboarding before minting Mode H offers");
    }
    if (!connect.chargesEnabled) {
      throw new Error("Stripe Connect account is not charges_enabled yet");
    }

    // H-5: reuse active Session for the same offerId when still valid.
    const existing = this.modeHOffers.getByOfferId(input.offerId);
    if (
      existing &&
      !existing.outcomeMintedAt &&
      existing.amount.amountMinor === input.amountMinor &&
      existing.amount.currency === input.currency &&
      existing.checkoutUrl &&
      existing.optionExpiresAt &&
      Date.parse(existing.optionExpiresAt) > Date.now() + 60_000
    ) {
      return {
        settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
        optionExpiresAt: existing.optionExpiresAt,
        checkoutUrl: existing.checkoutUrl,
        checkoutSessionId: existing.checkoutSessionId,
      };
    }

    this.modeHOffers.assertCanAcceptPending();

    const reservationId = this.abuse.reserveSessionMint(workspaceId);
    try {
      const ttlSec = this.deps.optionTtlSeconds ?? 24 * 60 * 60;
      const optionExpiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
      const expiresAtUnix = Math.floor(Date.parse(optionExpiresAt) / 1000);
      const successBase =
        this.deps.checkoutSuccessUrl?.trim() || "https://atom.qwixl.com/app/?commerce=success";
      const cancelBase =
        this.deps.checkoutCancelUrl?.trim() || "https://atom.qwixl.com/app/?commerce=cancel";
      const join = successBase.includes("?") ? "&" : "?";
      const session = await createModeHCheckoutSession({
        secretKey: secret,
        stripeAccountId: connect.stripeAccountId,
        offerId: input.offerId,
        intentId: input.intentId,
        label: input.label,
        amountMinor: input.amountMinor,
        currency: input.currency,
        successUrl: `${successBase}${join}offerId=${encodeURIComponent(input.offerId)}`,
        cancelUrl: `${cancelBase}${join}offerId=${encodeURIComponent(input.offerId)}`,
        expiresAtUnix,
      });
      this.abuse.commitSessionMint(reservationId, workspaceId);
      return {
        settlementMode: COMMERCE_SETTLEMENT_MERCHANT_CHECKOUT,
        optionExpiresAt,
        checkoutUrl: session.url,
        checkoutSessionId: session.sessionId,
      };
    } catch (error) {
      this.abuse.releaseSessionMint(reservationId);
      throw error;
    }
  }

  async handleInboxObject(object: DataObject): Promise<DataObject | undefined> {
    if (object.governance.purpose === COMMERCE_OUTCOME_PURPOSE) {
      return this.handleOutcomeInbox(object);
    }
    if (object.governance.purpose === COMMERCE_OFFER_PURPOSE) {
      const { payload } = await verifyCommerceOffer(object);
      try {
        this.abuse.assertOfferPairAllowed(object.issuerDid, this.deps.identity.did);
      } catch (error) {
        if (error instanceof CommerceAbuseError) {
          console.warn(`[commerce-abuse] dropped offer from ${object.issuerDid}: ${error.message}`);
          return undefined;
        }
        throw error;
      }
      this.inboundOffers.set(payload.offerId, {
        merchantDid: object.issuerDid,
        payload,
      });
      return undefined;
    }
    if (object.governance.purpose !== "commerce:intent") return undefined;
    if (!this.deps.businessMode) return undefined;

    const { payload } = await verifyCommerceIntent(object);
    this.intents.set(payload.intentId, payload);
    this.writer.persist();
    const peerUrl = payload.replyUrl?.trim();
    if (!peerUrl) return undefined;

    const deliverDecline = async (reasonCode: "no-match" | "policy", note?: string) => {
      if (!this.abuse.assertDeclineAllowed(this.deps.identity.did, object.issuerDid)) {
        console.warn(`[commerce-abuse] decline cap — suppressing decline to ${object.issuerDid}`);
        return undefined;
      }
      if (note === "rate_limited" || note === "mint_budget") {
        const { suggestMute } = this.abuse.recordRateLimitedDecline(object.issuerDid);
        if (suggestMute) this.deps.onSuggestMute?.(object.issuerDid);
      }
      const declineObject = await createCommerceDecline({
        identity: this.deps.identity,
        payload: {
          intentId: payload.intentId,
          reasonCode,
          note,
          peerDid: object.issuerDid,
        },
      });
      await deliverSignedObject({
        mlsStore: this.deps.mlsStore,
        peerUrl,
        peerDid: object.issuerDid,
        object: declineObject,
        encrypt: false,
      });
      return declineObject;
    };

    try {
      this.abuse.assertInboundIntentAllowed(object.issuerDid);
    } catch (error) {
      if (error instanceof CommerceAbuseError) {
        return deliverDecline("policy", error.code);
      }
      throw error;
    }

    try {
      assertHostedBusinessCommerceEligible();
    } catch (error) {
      return deliverDecline(
        "policy",
        error instanceof Error ? error.message : "Hosted Atom Business required",
      );
    }

    const match = matchCatalogForIntent(this.deps.catalog.list(), payload);
    if (!match) {
      return deliverDecline("no-match");
    }

    const offerId = `offer-${payload.intentId}-${match.item.catalogItemId}`;
    try {
      const modeH = await this.buildModeHOfferFields({
        offerId,
        intentId: payload.intentId,
        label: match.item.label,
        amountMinor: match.item.amount.amountMinor,
        currency: match.item.amount.currency,
      });
      this.rememberPendingOffer({
        offerId,
        intentId: payload.intentId,
        checkoutSessionId: modeH.checkoutSessionId,
        amount: match.item.amount,
        label: match.item.label,
        buyerPeerUrl: peerUrl,
        buyerDid: object.issuerDid,
        optionExpiresAt: modeH.optionExpiresAt,
        checkoutUrl: modeH.checkoutUrl,
      });
      const offerObject = await createCommerceOffer({
        identity: this.deps.identity,
        payload: {
          offerId,
          intentId: payload.intentId,
          catalogItemId: match.item.catalogItemId,
          label: match.item.label,
          amount: match.item.amount,
          available: match.item.available,
          terms: match.item.terms ?? [],
          sponsored: match.item.sponsored,
          sponsoredRank: match.item.sponsoredRank,
          peerDid: object.issuerDid,
          ...modeH,
        },
        ttlSeconds: Math.max(
          60,
          Math.floor((Date.parse(modeH.optionExpiresAt) - Date.now()) / 1000),
        ),
      });
      await deliverSignedObject({
        mlsStore: this.deps.mlsStore,
        peerUrl,
        peerDid: object.issuerDid,
        object: offerObject,
        encrypt: false,
      });
      return offerObject;
    } catch (error) {
      if (error instanceof CommerceAbuseError) {
        return deliverDecline("policy", error.code);
      }
      return deliverDecline(
        "policy",
        error instanceof Error ? error.message : "Unable to mint Mode H checkout offer",
      );
    }
  }

  private async handleOutcomeInbox(object: DataObject): Promise<DataObject> {
    const { payload } = await verifyCommerceOutcome(object);
    const cached = this.inboundOffers.get(payload.offerId);
    if (!cached) {
      throw new Error(`commerce:outcome for unknown offerId ${payload.offerId}`);
    }
    if (cached.merchantDid !== object.issuerDid) {
      throw new Error("commerce:outcome issuerDid does not match merchant of the offer");
    }
    if (cached.payload.intentId !== payload.intentId) {
      throw new Error("commerce:outcome intentId does not match offer");
    }
    if (cached.payload.checkoutSessionId !== payload.checkoutSessionId) {
      throw new Error("commerce:outcome checkoutSessionId does not match offer");
    }
    if (
      cached.payload.amount.amountMinor !== payload.amount.amountMinor ||
      cached.payload.amount.currency !== payload.amount.currency
    ) {
      throw new Error("commerce:outcome amount does not match offer");
    }
    const spendKey = `${payload.offerId}:${payload.checkoutSessionId}`;
    if (this.processedOutcomes.has(spendKey)) {
      return object;
    }
    this.processedOutcomes.add(spendKey);
    this.deps.onCommerceOutcomePaid?.({
      amountMinor: payload.amount.amountMinor,
      currency: payload.amount.currency,
      description: `commerce outcome ${payload.offerId}`,
      offerId: payload.offerId,
      checkoutSessionId: payload.checkoutSessionId,
    });
    return object;
  }
}
