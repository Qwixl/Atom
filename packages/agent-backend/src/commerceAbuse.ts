/**
 * BUS-ABUSE-01 — commerce abuse counters + Agent Shopping gate (D139 Mode H).
 * Fail-closed: missing/corrupt store denies mint/intent until recovered.
 */
import { resolveDataPath } from "./dataDir.js";
import { createJsonStoreWriter, loadJsonStore } from "./persistedJsonStore.js";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";

const ABUSE_FILE = "commerce-abuse-counters.json";
const SHOPPING_FILE = "agent-shopping.json";
const SCHEMA_VERSION = 1;

export const ABUSE_DEFAULTS = {
  intentPerIssuerPerWindow: 10,
  intentWindowMs: 10 * 60 * 1000,
  offerPerPairPerWindow: 20,
  offerWindowMs: 10 * 60 * 1000,
  sessionMintsPerHour: 30,
  sessionMintWindowMs: 60 * 60 * 1000,
  webhookPerIpPerMinute: 120,
  webhookWindowMs: 60 * 1000,
  buyerIntentsPerHour: 20,
  buyerIntentWindowMs: 60 * 60 * 1000,
  declinePerPairPerHour: 30,
  declineWindowMs: 60 * 60 * 1000,
  suggestMuteThreshold: 15,
  pendingOfferMax: 200,
  maxBodyBytes: 256 * 1024,
} as const;

interface WindowBucket {
  count: number;
  resetAt: number;
}

interface AbuseFile {
  schemaVersion: number;
  buckets: Record<string, WindowBucket>;
  mintReservations: Record<string, number>;
  rateLimitedDeclines: Record<string, WindowBucket>;
  suggestMuteDismissedUntil: Record<string, string>;
  loadedOk: boolean;
}

interface ShoppingFile {
  schemaVersion: number;
  agentShoppingEnabled: boolean;
  ownerAbuseAttestedAt?: string;
  updatedAt: string;
}

function parsePositiveInt(envVal: string | undefined, fallback: number): number {
  if (!envVal?.trim()) return fallback;
  const n = Number(envVal);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export class CommerceAbuseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "rate_limited"
      | "mint_budget"
      | "shopping_disabled"
      | "abuse_store"
      | "abuse_kill_unattested",
  ) {
    super(message);
    this.name = "CommerceAbuseError";
  }
}

export class CommerceAbuseStore {
  static readonly storeMeta = AGENT_STORE_REGISTRY.commerceAbuse;

  private buckets = new Map<string, WindowBucket>();
  private mintReservations = new Map<string, number>();
  private rateLimitedDeclines = new Map<string, WindowBucket>();
  private suggestMuteDismissedUntil = new Map<string, string>();
  private loadedOk = false;
  private agentShoppingEnabled = false;
  private ownerAbuseAttestedAt: string | undefined;

  private abusePath: string;
  private shoppingPath: string;
  private abuseWriter: ReturnType<typeof createJsonStoreWriter<AbuseFile>>;
  private shoppingWriter: ReturnType<typeof createJsonStoreWriter<ShoppingFile>>;
  private readonly fixedPaths: boolean;

  constructor(abusePath?: string, shoppingPath?: string) {
    this.fixedPaths = abusePath !== undefined && shoppingPath !== undefined;
    this.abusePath = abusePath ?? resolveDataPath(ABUSE_FILE);
    this.shoppingPath = shoppingPath ?? resolveDataPath(SHOPPING_FILE);
    this.abuseWriter = this.makeAbuseWriter();
    this.shoppingWriter = this.makeShoppingWriter();
  }

  private makeAbuseWriter() {
    return createJsonStoreWriter<AbuseFile>(
      this.abusePath,
      SCHEMA_VERSION,
      "commerce-abuse",
      () => this.snapshotAbuse(),
    );
  }

  private makeShoppingWriter() {
    return createJsonStoreWriter<ShoppingFile>(
      this.shoppingPath,
      SCHEMA_VERSION,
      "agent-shopping",
      () => ({
        agentShoppingEnabled: this.agentShoppingEnabled,
        ownerAbuseAttestedAt: this.ownerAbuseAttestedAt,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  /** Re-resolve paths when identity/data dir changes (process singleton / test isolation). */
  private rebindPathsIfNeeded(): void {
    if (this.fixedPaths) return;
    const nextAbuse = resolveDataPath(ABUSE_FILE);
    const nextShopping = resolveDataPath(SHOPPING_FILE);
    if (nextAbuse === this.abusePath && nextShopping === this.shoppingPath) return;
    this.abusePath = nextAbuse;
    this.shoppingPath = nextShopping;
    this.abuseWriter = this.makeAbuseWriter();
    this.shoppingWriter = this.makeShoppingWriter();
  }

  async load(): Promise<void> {
    this.rebindPathsIfNeeded();
    try {
      const { access } = await import("node:fs/promises");
      const abuseExists = await access(this.abusePath)
        .then(() => true)
        .catch(() => false);
      await loadJsonStore<AbuseFile>(this.abusePath, (file) => {
        this.buckets.clear();
        this.mintReservations.clear();
        this.rateLimitedDeclines.clear();
        this.suggestMuteDismissedUntil.clear();
        // Primary present but unreadable/corrupt: fail closed (do not treat as empty boot).
        // readJsonFile can return null when .bak is missing after a SyntaxError on primary.
        if (!file) {
          this.loadedOk = !abuseExists;
          return;
        }
        if (file.schemaVersion !== SCHEMA_VERSION) {
          // Existing primary with unknown version — deny until migrated, do not empty-boot.
          this.loadedOk = false;
          return;
        }
        for (const [k, v] of Object.entries(file.buckets ?? {})) {
          if (v && typeof v.count === "number" && typeof v.resetAt === "number") {
            this.buckets.set(k, { count: v.count, resetAt: v.resetAt });
          }
        }
        for (const [k, v] of Object.entries(file.mintReservations ?? {})) {
          if (typeof v === "number") this.mintReservations.set(k, v);
        }
        for (const [k, v] of Object.entries(file.rateLimitedDeclines ?? {})) {
          if (v && typeof v.count === "number" && typeof v.resetAt === "number") {
            this.rateLimitedDeclines.set(k, { count: v.count, resetAt: v.resetAt });
          }
        }
        for (const [k, v] of Object.entries(file.suggestMuteDismissedUntil ?? {})) {
          if (typeof v === "string") this.suggestMuteDismissedUntil.set(k, v);
        }
        this.loadedOk = true;
      });
      if (!this.loadedOk) return;
      await loadJsonStore<ShoppingFile>(this.shoppingPath, (file) => {
        this.agentShoppingEnabled = file?.agentShoppingEnabled === true;
        this.ownerAbuseAttestedAt =
          typeof file?.ownerAbuseAttestedAt === "string" ? file.ownerAbuseAttestedAt : undefined;
      });
    } catch {
      this.loadedOk = false;
    }
  }

  isReady(): boolean {
    return this.loadedOk;
  }

  assertReady(): void {
    if (!this.loadedOk) {
      throw new CommerceAbuseError(
        "Commerce abuse store not ready — denying until recovered",
        "abuse_store",
      );
    }
  }

  /** 6A: limits on unless off+attested. */
  assertAbusePolicyAllowsUnlimitedOrEnforce(): "enforce" | "unlimited" {
    this.assertReady();
    const mode = process.env.ATOM_COMMERCE_ABUSE?.trim().toLowerCase();
    if (mode === "off" || mode === "0" || mode === "false") {
      const attested = Boolean(this.ownerAbuseAttestedAt);
      if (!attested) {
        throw new CommerceAbuseError(
          "ATOM_COMMERCE_ABUSE=off requires owner attestation (chrome)",
          "abuse_kill_unattested",
        );
      }
      return "unlimited";
    }
    return "enforce";
  }

  getAgentShoppingEnabled(): boolean {
    return this.agentShoppingEnabled;
  }

  setAgentShoppingEnabled(enabled: boolean): void {
    this.agentShoppingEnabled = enabled;
    this.shoppingWriter.persist();
  }

  attestAbuseKillSwitch(): void {
    this.ownerAbuseAttestedAt = new Date().toISOString();
    this.shoppingWriter.persist();
  }

  assertAgentShoppingOn(): void {
    this.assertReady();
    if (!this.agentShoppingEnabled) {
      throw new CommerceAbuseError(
        "Agent Shopping is off — enable in settings before sending purchase intents",
        "shopping_disabled",
      );
    }
  }

  checkAndIncrement(
    key: string,
    max: number,
    windowMs: number,
    code: "rate_limited" | "mint_budget" = "rate_limited",
  ): void {
    this.assertReady();
    if (this.assertAbusePolicyAllowsUnlimitedOrEnforce() === "unlimited") return;
    if (max <= 0) {
      throw new CommerceAbuseError("Commerce limit is zero — denying", code);
    }
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= max) {
      throw new CommerceAbuseError(`Commerce rate limited (${key.split(":")[0]})`, code);
    }
    bucket.count += 1;
    this.abuseWriter.persist();
  }

  /** Peek without incrementing — asleep enqueue pre-check (avoids double-count on dequeue). */
  assertWindowBudgetAvailable(
    key: string,
    max: number,
    _windowMs: number,
    code: "rate_limited" | "mint_budget" = "rate_limited",
  ): void {
    this.assertReady();
    if (this.assertAbusePolicyAllowsUnlimitedOrEnforce() === "unlimited") return;
    if (max <= 0) {
      throw new CommerceAbuseError("Commerce limit is zero — denying", code);
    }
    const now = Date.now();
    const bucket = this.buckets.get(key);
    const count = !bucket || bucket.resetAt <= now ? 0 : bucket.count;
    if (count >= max) {
      throw new CommerceAbuseError(`Commerce rate limited (${key.split(":")[0]})`, code);
    }
  }

  assertInboundIntentAllowed(issuerDid: string): void {
    const max = parsePositiveInt(
      process.env.ATOM_COMMERCE_INTENT_RATE,
      ABUSE_DEFAULTS.intentPerIssuerPerWindow,
    );
    this.checkAndIncrement(
      `intent:${issuerDid}`,
      max,
      ABUSE_DEFAULTS.intentWindowMs,
      "rate_limited",
    );
  }

  /** Peek without reserving — asleep enqueue pre-check (BUS-ABUSE-01a / diff F-1). */
  assertInboundIntentBudgetAvailable(issuerDid: string): void {
    const max = parsePositiveInt(
      process.env.ATOM_COMMERCE_INTENT_RATE,
      ABUSE_DEFAULTS.intentPerIssuerPerWindow,
    );
    this.assertWindowBudgetAvailable(
      `intent:${issuerDid}`,
      max,
      ABUSE_DEFAULTS.intentWindowMs,
      "rate_limited",
    );
  }

  assertBuyerIntentVelocity(workspaceId: string): void {
    const max = parsePositiveInt(
      process.env.ATOM_COMMERCE_BUYER_INTENT_RATE,
      ABUSE_DEFAULTS.buyerIntentsPerHour,
    );
    this.checkAndIncrement(
      `buyer-intent:${workspaceId}`,
      max,
      ABUSE_DEFAULTS.buyerIntentWindowMs,
      "rate_limited",
    );
  }

  assertOfferPairAllowed(merchantDid: string, buyerDid: string): void {
    const max = parsePositiveInt(
      process.env.ATOM_COMMERCE_OFFER_RATE,
      ABUSE_DEFAULTS.offerPerPairPerWindow,
    );
    this.checkAndIncrement(
      `offer:${merchantDid}:${buyerDid}`,
      max,
      ABUSE_DEFAULTS.offerWindowMs,
      "rate_limited",
    );
  }

  /** Peek without reserving — asleep enqueue pre-check (BUS-ABUSE-01a). */
  assertSessionMintBudgetAvailable(workspaceId: string): void {
    this.assertReady();
    if (this.assertAbusePolicyAllowsUnlimitedOrEnforce() === "unlimited") return;
    const max = parsePositiveInt(
      process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET,
      ABUSE_DEFAULTS.sessionMintsPerHour,
    );
    const key = `mint:${workspaceId}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);
    const count = !bucket || bucket.resetAt <= now ? 0 : bucket.count;
    const reserved = [...this.mintReservations.values()].filter((t) => t > now).length;
    if (count + reserved >= max) {
      throw new CommerceAbuseError("Checkout Session mint budget exhausted", "mint_budget");
    }
  }

  /** Reserve a Session mint slot before Stripe create. Returns reservation id. */
  reserveSessionMint(workspaceId: string): string {
    this.assertReady();
    if (this.assertAbusePolicyAllowsUnlimitedOrEnforce() === "unlimited") {
      return `unlimited:${Date.now()}`;
    }
    const max = parsePositiveInt(
      process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET,
      ABUSE_DEFAULTS.sessionMintsPerHour,
    );
    const key = `mint:${workspaceId}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + ABUSE_DEFAULTS.sessionMintWindowMs };
      this.buckets.set(key, bucket);
    }
    const reserved = [...this.mintReservations.values()].filter((t) => t > now).length;
    if (bucket.count + reserved >= max) {
      throw new CommerceAbuseError("Checkout Session mint budget exhausted", "mint_budget");
    }
    const id = `res:${workspaceId}:${now}:${Math.random().toString(36).slice(2, 8)}`;
    this.mintReservations.set(id, now + 120_000);
    this.abuseWriter.persist();
    return id;
  }

  commitSessionMint(reservationId: string, workspaceId: string): void {
    if (reservationId.startsWith("unlimited:")) return;
    this.mintReservations.delete(reservationId);
    const max = parsePositiveInt(
      process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET,
      ABUSE_DEFAULTS.sessionMintsPerHour,
    );
    // Count against window without double-throw.
    const key = `mint:${workspaceId}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + ABUSE_DEFAULTS.sessionMintWindowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count < max) bucket.count += 1;
    this.abuseWriter.persist();
  }

  releaseSessionMint(reservationId: string): void {
    this.mintReservations.delete(reservationId);
    this.abuseWriter.persist();
  }

  assertWebhookIpAllowed(ip: string): void {
    this.assertReady();
    if (this.assertAbusePolicyAllowsUnlimitedOrEnforce() === "unlimited") return;
    const max = parsePositiveInt(
      process.env.ATOM_COMMERCE_WEBHOOK_RATE,
      ABUSE_DEFAULTS.webhookPerIpPerMinute,
    );
    this.checkAndIncrement(`webhook:${ip}`, max, ABUSE_DEFAULTS.webhookWindowMs, "rate_limited");
  }

  assertDeclineAllowed(merchantDid: string, buyerDid: string): boolean {
    try {
      const max = parsePositiveInt(
        process.env.ATOM_COMMERCE_DECLINE_RATE,
        ABUSE_DEFAULTS.declinePerPairPerHour,
      );
      this.checkAndIncrement(
        `decline:${merchantDid}:${buyerDid}`,
        max,
        ABUSE_DEFAULTS.declineWindowMs,
        "rate_limited",
      );
      return true;
    } catch {
      return false;
    }
  }

  recordRateLimitedDecline(peerDid: string): { suggestMute: boolean } {
    const now = Date.now();
    let bucket = this.rateLimitedDeclines.get(peerDid);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + ABUSE_DEFAULTS.declineWindowMs };
      this.rateLimitedDeclines.set(peerDid, bucket);
    }
    bucket.count += 1;
    this.abuseWriter.persist();
    const dismissed = this.suggestMuteDismissedUntil.get(peerDid);
    if (dismissed && Date.parse(dismissed) > now) {
      return { suggestMute: false };
    }
    return { suggestMute: bucket.count >= ABUSE_DEFAULTS.suggestMuteThreshold };
  }

  dismissSuggestMute(peerDid: string, hours = 24): void {
    this.suggestMuteDismissedUntil.set(
      peerDid,
      new Date(Date.now() + hours * 3600_000).toISOString(),
    );
    this.abuseWriter.persist();
  }

  listSuggestMutes(): Array<{ peerDid: string; count: number }> {
    const now = Date.now();
    const out: Array<{ peerDid: string; count: number }> = [];
    for (const [peerDid, bucket] of this.rateLimitedDeclines) {
      if (bucket.resetAt <= now) continue;
      if (bucket.count < ABUSE_DEFAULTS.suggestMuteThreshold) continue;
      const dismissed = this.suggestMuteDismissedUntil.get(peerDid);
      if (dismissed && Date.parse(dismissed) > now) continue;
      out.push({ peerDid, count: bucket.count });
    }
    return out;
  }

  private snapshotAbuse(): Omit<AbuseFile, "schemaVersion"> {
    return {
      buckets: Object.fromEntries(this.buckets),
      mintReservations: Object.fromEntries(this.mintReservations),
      rateLimitedDeclines: Object.fromEntries(this.rateLimitedDeclines),
      suggestMuteDismissedUntil: Object.fromEntries(this.suggestMuteDismissedUntil),
      loadedOk: this.loadedOk,
    };
  }
}

/** Process-local default store; server constructs its own for isolation in tests. */
export const commerceAbuseStore = new CommerceAbuseStore();
