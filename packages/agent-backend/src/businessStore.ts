import {
  createCommerceDecline,
  createCommerceIntent,
  createCommerceOffer,
  verifyCommerceIntent,
  type CommerceIntentPayload,
} from "@qwixl/a2a-transport";
import { matchCatalogForIntent } from "@qwixl/owner-store";
import type { AgentKeyPair, DataObject } from "@qwixl/protocol";
import { deliverSignedObject } from "./deliverObject.js";
import type { BusinessCatalogStore } from "./businessCatalogStore.js";
import type { MlsSessionStore } from "./mlsSessions.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";
import { resolveDataPath } from "./dataDir.js";
import { createJsonStoreWriter, loadJsonStore } from "./persistedJsonStore.js";

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
}

interface PeerDelivery {
  peerUrl: string;
  peerDid?: string;
  encrypt?: boolean;
}

export class BusinessStore {
  static readonly storeMeta = AGENT_STORE_REGISTRY.commerceIntents;
  private readonly intents = new Map<string, CommerceIntentPayload>();
  private readonly filePath: string;
  private readonly writer: ReturnType<typeof createJsonStoreWriter<CommerceIntentsFile>>;

  constructor(
    private readonly deps: BusinessStoreDeps,
    filePath = resolveDataPath(COMMERCE_INTENTS_FILE),
  ) {
    this.filePath = filePath;
    this.writer = createJsonStoreWriter<CommerceIntentsFile>(
      this.filePath,
      SCHEMA_VERSION,
      "commerce-intents",
      () => ({ intents: this.listIntents() }),
    );
  }

  async load(): Promise<void> {
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

  async sendIntent(params: {
    payload: CommerceIntentPayload;
    peerUrl?: string;
    peerDid?: string;
    encrypt?: boolean;
  }): Promise<DataObject> {
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
    const item = this.deps.catalog.get(params.catalogItemId);
    if (!item) throw new Error(`Unknown catalog item: ${params.catalogItemId}`);
    const offerId = `offer-${params.intentId}-${params.catalogItemId}`;
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
      },
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

  async handleInboxObject(object: DataObject): Promise<DataObject | undefined> {
    if (object.governance.purpose !== "commerce:intent") return undefined;
    if (!this.deps.businessMode) return undefined;

    const { payload } = await verifyCommerceIntent(object);
    this.intents.set(payload.intentId, payload);
    this.writer.persist();
    const peerUrl = payload.replyUrl?.trim();
    if (!peerUrl) return undefined;

    const match = matchCatalogForIntent(this.deps.catalog.list(), payload);
    if (!match) {
      const declineObject = await createCommerceDecline({
        identity: this.deps.identity,
        payload: {
          intentId: payload.intentId,
          reasonCode: "no-match",
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
    }

    const offerId = `offer-${payload.intentId}-${match.item.catalogItemId}`;
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
      },
    });
    await deliverSignedObject({
      mlsStore: this.deps.mlsStore,
      peerUrl,
      peerDid: object.issuerDid,
      object: offerObject,
      encrypt: false,
    });
    return offerObject;
  }
}
