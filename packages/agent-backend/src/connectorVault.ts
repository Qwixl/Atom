import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  decryptJson,
  encryptJson,
  generateMasterKey,
  type DpopKeyPair,
  type EncryptedBlob,
} from "@qwixl/connector-custody";
import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";

const MASTER_KEY_FILE = "vault-master.key";
const VAULT_FILE = "connector-vault.enc";

export interface StoredOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  dpopJkt?: string;
}

export interface StoredOAuthClient {
  clientId: string;
  clientSecret: string;
  configuredAt: number;
}

export interface StoredWebAuthnCredential {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: string[];
}

export interface StoredWebcalFeed {
  id: string;
  label: string;
  url: string;
  addedAt: number;
}

export interface StoredRssFeed {
  id: string;
  label: string;
  url: string;
  addedAt: number;
}

export interface StoredBookmark {
  id: string;
  label: string;
  url: string;
  addedAt: number;
}

/** Personal API token for token-based connectors (Todoist, GitHub, Notion). */
export interface StoredApiToken {
  token: string;
  configuredAt: number;
}

/** CalDAV account with Basic auth (Fastmail, Nextcloud, iCloud app password). */
export interface StoredCalDavAccount {
  id: string;
  label: string;
  calendarUrl: string;
  username: string;
  password: string;
  addedAt: number;
}

/** CardDAV address book with Basic auth (same providers as CalDAV). */
export interface StoredCardDavAccount {
  id: string;
  label: string;
  addressBookUrl: string;
  username: string;
  password: string;
  addedAt: number;
}

export interface StoredShopifyStore {
  shop: string;
  accessToken: string;
  configuredAt: number;
}

export interface StoredWooCommerceStore {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  configuredAt: number;
}

export type SquareEnvironment = "production" | "sandbox";

export interface StoredSquareStore {
  accessToken: string;
  environment: SquareEnvironment;
  configuredAt: number;
}

export interface StoredTrelloCredentials {
  apiKey: string;
  token: string;
  configuredAt: number;
}

export interface StoredHomeAssistantInstance {
  baseUrl: string;
  accessToken: string;
  configuredAt: number;
}

export interface StoredBlueskyAccount {
  handle: string;
  appPassword: string;
  pdsUrl?: string;
  configuredAt: number;
}

export interface StoredMastodonInstance {
  instanceUrl: string;
  accessToken: string;
  configuredAt: number;
}

interface ConnectorVaultPayload {
  schemaVersion: 1;
  oauth?: Record<string, StoredOAuthTokens>;
  oauthClients?: Record<string, StoredOAuthClient>;
  apiTokens?: Record<string, StoredApiToken>;
  caldavAccounts?: StoredCalDavAccount[];
  carddavAccounts?: StoredCardDavAccount[];
  businessStores?: {
    shopify?: StoredShopifyStore;
    woocommerce?: StoredWooCommerceStore;
    square?: StoredSquareStore;
  };
  trello?: StoredTrelloCredentials;
  homeAssistant?: StoredHomeAssistantInstance;
  bluesky?: StoredBlueskyAccount;
  mastodon?: StoredMastodonInstance;
  webcalFeeds?: StoredWebcalFeed[];
  rssFeeds?: StoredRssFeed[];
  bookmarks?: StoredBookmark[];
  dpopKey?: DpopKeyPair;
  webauthn?: StoredWebAuthnCredential[];
  ownerRecords?: unknown[];
  ownerProposals?: unknown[];
  attestations?: unknown[];
  /** Workspace-keyed chat text history envelopes (shell Chat feed sync). */
  chatFeeds?: Record<string, unknown>;
  /** Owner-declared standing intents for the Agent Brain heartbeat (D077 / BK-42). */
  standingIntents?: unknown[];
  /** Queued brain notifications awaiting shell delivery (BK-43). */
  brainPendingNotifications?: unknown[];
}

export class ConnectorVault {
  private masterKey: Uint8Array | null = null;
  private payload: ConnectorVaultPayload = { schemaVersion: 1 };
  private readonly masterKeyPath: string;
  private readonly vaultPath: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(
    masterKeyPath = resolveDataPath(MASTER_KEY_FILE),
    vaultPath = resolveDataPath(VAULT_FILE),
  ) {
    this.masterKeyPath = masterKeyPath;
    this.vaultPath = vaultPath;
  }

  async load(): Promise<void> {
    this.masterKey = await this.loadOrCreateMasterKey();
    const legacyOAuth = await readJsonFile<{
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
      scope?: string;
    }>(resolveDataPath("google-oauth.json"));
    const blob = await readJsonFile<EncryptedBlob>(this.vaultPath);
    if (blob) {
      this.payload = decryptJson<ConnectorVaultPayload>(this.masterKey, blob);
    } else if (legacyOAuth?.accessToken) {
      this.payload.oauth = {
        google: {
          accessToken: legacyOAuth.accessToken,
          refreshToken: legacyOAuth.refreshToken,
          expiresAt: legacyOAuth.expiresAt,
          scope: legacyOAuth.scope,
        },
      };
      await this.persist();
    }
  }

  private async loadOrCreateMasterKey(): Promise<Uint8Array> {
    try {
      const raw = await readFile(this.masterKeyPath);
      if (raw.length >= 32) return raw.subarray(0, 32);
    } catch {
      // create below
    }
    const key = generateMasterKey();
    await mkdir(path.dirname(this.masterKeyPath), { recursive: true });
    await writeFile(this.masterKeyPath, key, { mode: 0o600 });
    return key;
  }

  getDpopKeyPair(): DpopKeyPair | undefined {
    return this.payload.dpopKey;
  }

  async ensureDpopKeyPair(): Promise<DpopKeyPair> {
    if (this.payload.dpopKey) return this.payload.dpopKey;
    const { generateDpopKeyPair } = await import("@qwixl/connector-custody");
    this.payload.dpopKey = await generateDpopKeyPair();
    await this.persist();
    return this.payload.dpopKey;
  }

  getOAuth(provider: string): StoredOAuthTokens | undefined {
    return this.payload.oauth?.[provider];
  }

  async setOAuth(provider: string, tokens: StoredOAuthTokens): Promise<void> {
    this.payload.oauth ??= {};
    this.payload.oauth[provider] = tokens;
    await this.persist();
  }

  getOAuthClient(provider: string): StoredOAuthClient | undefined {
    return this.payload.oauthClients?.[provider];
  }

  async setOAuthClient(provider: string, client: StoredOAuthClient): Promise<void> {
    this.payload.oauthClients ??= {};
    this.payload.oauthClients[provider] = client;
    await this.persist();
  }

  async clearOAuth(provider: string): Promise<void> {
    if (this.payload.oauth?.[provider]) {
      delete this.payload.oauth[provider];
      await this.persist();
    }
  }

  getApiToken(connectorId: string): StoredApiToken | undefined {
    return this.payload.apiTokens?.[connectorId];
  }

  async setApiToken(connectorId: string, token: string): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new Error("token required");
    }
    this.payload.apiTokens ??= {};
    this.payload.apiTokens[connectorId] = {
      token: trimmed,
      configuredAt: Date.now(),
    };
    await this.persist();
  }

  async clearApiToken(connectorId: string): Promise<void> {
    if (this.payload.apiTokens?.[connectorId]) {
      delete this.payload.apiTokens[connectorId];
      await this.persist();
    }
  }

  getCalDavAccounts(): StoredCalDavAccount[] {
    return this.payload.caldavAccounts ?? [];
  }

  async addCalDavAccount(input: {
    label: string;
    calendarUrl: string;
    username: string;
    password: string;
  }): Promise<StoredCalDavAccount> {
    const account: StoredCalDavAccount = {
      id: crypto.randomUUID(),
      label: input.label.trim() || "CalDAV",
      calendarUrl: input.calendarUrl.trim(),
      username: input.username.trim(),
      password: input.password,
      addedAt: Date.now(),
    };
    this.payload.caldavAccounts = [...this.getCalDavAccounts(), account];
    await this.persist();
    return account;
  }

  async removeCalDavAccount(accountId: string): Promise<boolean> {
    const existing = this.getCalDavAccounts();
    const next = existing.filter((account) => account.id !== accountId);
    if (next.length === existing.length) return false;
    this.payload.caldavAccounts = next;
    await this.persist();
    return true;
  }

  getCardDavAccounts(): StoredCardDavAccount[] {
    return this.payload.carddavAccounts ?? [];
  }

  async addCardDavAccount(input: {
    label: string;
    addressBookUrl: string;
    username: string;
    password: string;
  }): Promise<StoredCardDavAccount> {
    const account: StoredCardDavAccount = {
      id: crypto.randomUUID(),
      label: input.label.trim() || "CardDAV",
      addressBookUrl: input.addressBookUrl.trim(),
      username: input.username.trim(),
      password: input.password,
      addedAt: Date.now(),
    };
    this.payload.carddavAccounts = [...this.getCardDavAccounts(), account];
    await this.persist();
    return account;
  }

  async removeCardDavAccount(accountId: string): Promise<boolean> {
    const existing = this.getCardDavAccounts();
    const next = existing.filter((account) => account.id !== accountId);
    if (next.length === existing.length) return false;
    this.payload.carddavAccounts = next;
    await this.persist();
    return true;
  }

  getShopifyStore(): StoredShopifyStore | undefined {
    return this.payload.businessStores?.shopify;
  }

  async setShopifyStore(shop: string, accessToken: string): Promise<void> {
    const trimmedShop = shop.trim();
    const trimmedToken = accessToken.trim();
    if (!trimmedShop || !trimmedToken) {
      throw new Error("shop and accessToken required");
    }
    this.payload.businessStores ??= {};
    this.payload.businessStores.shopify = {
      shop: trimmedShop,
      accessToken: trimmedToken,
      configuredAt: Date.now(),
    };
    await this.persist();
  }

  async clearShopifyStore(): Promise<void> {
    if (this.payload.businessStores?.shopify) {
      delete this.payload.businessStores.shopify;
      await this.persist();
    }
  }

  getWooCommerceStore(): StoredWooCommerceStore | undefined {
    return this.payload.businessStores?.woocommerce;
  }

  async setWooCommerceStore(
    storeUrl: string,
    consumerKey: string,
    consumerSecret: string,
  ): Promise<void> {
    const url = storeUrl.trim();
    const key = consumerKey.trim();
    const secret = consumerSecret.trim();
    if (!url || !key || !secret) {
      throw new Error("storeUrl, consumerKey, and consumerSecret required");
    }
    this.payload.businessStores ??= {};
    this.payload.businessStores.woocommerce = {
      storeUrl: url,
      consumerKey: key,
      consumerSecret: secret,
      configuredAt: Date.now(),
    };
    await this.persist();
  }

  async clearWooCommerceStore(): Promise<void> {
    if (this.payload.businessStores?.woocommerce) {
      delete this.payload.businessStores.woocommerce;
      await this.persist();
    }
  }

  getSquareStore(): StoredSquareStore | undefined {
    return this.payload.businessStores?.square;
  }

  async setSquareStore(accessToken: string, environment: SquareEnvironment): Promise<void> {
    const token = accessToken.trim();
    if (!token) {
      throw new Error("accessToken required");
    }
    this.payload.businessStores ??= {};
    this.payload.businessStores.square = {
      accessToken: token,
      environment,
      configuredAt: Date.now(),
    };
    await this.persist();
  }

  async clearSquareStore(): Promise<void> {
    if (this.payload.businessStores?.square) {
      delete this.payload.businessStores.square;
      await this.persist();
    }
  }

  getTrelloCredentials(): StoredTrelloCredentials | undefined {
    return this.payload.trello;
  }

  async setTrelloCredentials(apiKey: string, token: string): Promise<void> {
    const key = apiKey.trim();
    const accessToken = token.trim();
    if (!key || !accessToken) {
      throw new Error("apiKey and token required");
    }
    this.payload.trello = {
      apiKey: key,
      token: accessToken,
      configuredAt: Date.now(),
    };
    await this.persist();
  }

  async clearTrelloCredentials(): Promise<void> {
    if (this.payload.trello) {
      delete this.payload.trello;
      await this.persist();
    }
  }

  getHomeAssistantInstance(): StoredHomeAssistantInstance | undefined {
    return this.payload.homeAssistant;
  }

  async setHomeAssistantInstance(baseUrl: string, accessToken: string): Promise<void> {
    const url = baseUrl.trim();
    const token = accessToken.trim();
    if (!url || !token) {
      throw new Error("baseUrl and accessToken required");
    }
    this.payload.homeAssistant = {
      baseUrl: url,
      accessToken: token,
      configuredAt: Date.now(),
    };
    await this.persist();
  }

  async clearHomeAssistantInstance(): Promise<void> {
    if (this.payload.homeAssistant) {
      delete this.payload.homeAssistant;
      await this.persist();
    }
  }

  getBlueskyAccount(): StoredBlueskyAccount | undefined {
    return this.payload.bluesky;
  }

  async setBlueskyAccount(handle: string, appPassword: string, pdsUrl?: string): Promise<void> {
    const identifier = handle.trim();
    const password = appPassword.trim();
    if (!identifier || !password) {
      throw new Error("handle and appPassword required");
    }
    this.payload.bluesky = {
      handle: identifier,
      appPassword: password,
      pdsUrl: pdsUrl?.trim() || undefined,
      configuredAt: Date.now(),
    };
    await this.persist();
  }

  async clearBlueskyAccount(): Promise<void> {
    if (this.payload.bluesky) {
      delete this.payload.bluesky;
      await this.persist();
    }
  }

  getMastodonInstance(): StoredMastodonInstance | undefined {
    return this.payload.mastodon;
  }

  async setMastodonInstance(instanceUrl: string, accessToken: string): Promise<void> {
    const url = instanceUrl.trim();
    const token = accessToken.trim();
    if (!url || !token) {
      throw new Error("instanceUrl and accessToken required");
    }
    this.payload.mastodon = {
      instanceUrl: url,
      accessToken: token,
      configuredAt: Date.now(),
    };
    await this.persist();
  }

  async clearMastodonInstance(): Promise<void> {
    if (this.payload.mastodon) {
      delete this.payload.mastodon;
      await this.persist();
    }
  }

  getWebcalFeeds(): StoredWebcalFeed[] {
    return this.payload.webcalFeeds ?? [];
  }

  async addWebcalFeed(input: { label: string; url: string }): Promise<StoredWebcalFeed> {
    const feed: StoredWebcalFeed = {
      id: crypto.randomUUID(),
      label: input.label.trim() || "Calendar feed",
      url: input.url.trim(),
      addedAt: Date.now(),
    };
    this.payload.webcalFeeds = [...this.getWebcalFeeds(), feed];
    await this.persist();
    return feed;
  }

  async removeWebcalFeed(feedId: string): Promise<boolean> {
    const existing = this.getWebcalFeeds();
    const next = existing.filter((feed) => feed.id !== feedId);
    if (next.length === existing.length) return false;
    this.payload.webcalFeeds = next;
    await this.persist();
    return true;
  }

  getRssFeeds(): StoredRssFeed[] {
    return this.payload.rssFeeds ?? [];
  }

  async addRssFeed(input: { label: string; url: string }): Promise<StoredRssFeed> {
    const feed: StoredRssFeed = {
      id: crypto.randomUUID(),
      label: input.label.trim() || "News feed",
      url: input.url.trim(),
      addedAt: Date.now(),
    };
    this.payload.rssFeeds = [...this.getRssFeeds(), feed];
    await this.persist();
    return feed;
  }

  async removeRssFeed(feedId: string): Promise<boolean> {
    const existing = this.getRssFeeds();
    const next = existing.filter((feed) => feed.id !== feedId);
    if (next.length === existing.length) return false;
    this.payload.rssFeeds = next;
    await this.persist();
    return true;
  }

  getBookmarks(): StoredBookmark[] {
    return this.payload.bookmarks ?? [];
  }

  async addBookmark(input: { label: string; url: string }): Promise<StoredBookmark> {
    const item: StoredBookmark = {
      id: crypto.randomUUID(),
      label: input.label.trim() || "Bookmark",
      url: input.url.trim(),
      addedAt: Date.now(),
    };
    this.payload.bookmarks = [...this.getBookmarks(), item];
    await this.persist();
    return item;
  }

  async removeBookmark(bookmarkId: string): Promise<boolean> {
    const existing = this.getBookmarks();
    const next = existing.filter((item) => item.id !== bookmarkId);
    if (next.length === existing.length) return false;
    this.payload.bookmarks = next;
    await this.persist();
    return true;
  }

  listWebAuthnCredentials(): StoredWebAuthnCredential[] {
    return this.payload.webauthn ?? [];
  }

  async saveWebAuthnCredential(credential: StoredWebAuthnCredential): Promise<void> {
    const existing = this.payload.webauthn ?? [];
    this.payload.webauthn = [...existing.filter((item) => item.id !== credential.id), credential];
    await this.persist();
  }

  async updateWebAuthnCounter(credentialId: string, counter: number): Promise<void> {
    const creds = this.payload.webauthn ?? [];
    this.payload.webauthn = creds.map((cred) =>
      cred.id === credentialId ? { ...cred, counter } : cred,
    );
    await this.persist();
  }

  hasPasskey(): boolean {
    return (this.payload.webauthn?.length ?? 0) > 0;
  }

  getOwnerRecords<T>(): T[] {
    return (this.payload.ownerRecords ?? []) as T[];
  }

  async setOwnerRecords<T>(records: T[]): Promise<void> {
    this.payload.ownerRecords = records;
    await this.persist();
  }

  getOwnerProposals<T>(): T[] {
    return (this.payload.ownerProposals ?? []) as T[];
  }

  async setOwnerProposals<T>(proposals: T[]): Promise<void> {
    this.payload.ownerProposals = proposals;
    await this.persist();
  }

  getAttestations<T>(): T[] {
    return (this.payload.attestations ?? []) as T[];
  }

  async setAttestations<T>(entries: T[]): Promise<void> {
    this.payload.attestations = entries;
    await this.persist();
  }

  getChatFeed(workspaceId: string): unknown | null {
    const key = workspaceId.trim() || "personal";
    return this.payload.chatFeeds?.[key] ?? null;
  }

  async setChatFeed(workspaceId: string, feed: unknown): Promise<void> {
    const key = workspaceId.trim() || "personal";
    this.payload.chatFeeds = { ...(this.payload.chatFeeds ?? {}), [key]: feed };
    await this.persist();
  }

  getStandingIntents(): unknown[] {
    return this.payload.standingIntents ?? [];
  }

  async setStandingIntents(intents: unknown[]): Promise<void> {
    this.payload.standingIntents = intents;
    await this.persist();
  }

  getBrainPendingNotifications(): unknown[] {
    return this.payload.brainPendingNotifications ?? [];
  }

  async setBrainPendingNotifications(entries: unknown[]): Promise<void> {
    this.payload.brainPendingNotifications = entries;
    await this.persist();
  }

  private persist(): void {
    if (!this.masterKey) return;
    this.persistQueue = this.persistQueue
      .then(async () => {
        const blob = encryptJson(this.masterKey!, this.payload);
        await atomicWriteJson(this.vaultPath, blob);
      })
      .catch((error) => {
        console.warn(
          `[connector-vault] persist failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  async flush(): Promise<void> {
    await this.persistQueue;
  }
}
