import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ABUSE_DEFAULTS,
  CommerceAbuseError,
  CommerceAbuseStore,
} from "./commerceAbuse.js";

describe("BUS-ABUSE-01 CommerceAbuseStore", () => {
  let dir: string;
  let store: CommerceAbuseStore;
  let prevAbuse: string | undefined;
  let prevAttest: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "atom-abuse-"));
    prevAbuse = process.env.ATOM_COMMERCE_ABUSE;
    prevAttest = process.env.ATOM_COMMERCE_ABUSE_OWNER_ATTESTED;
    delete process.env.ATOM_COMMERCE_ABUSE;
    delete process.env.ATOM_COMMERCE_ABUSE_OWNER_ATTESTED;
    store = new CommerceAbuseStore(
      path.join(dir, "commerce-abuse-counters.json"),
      path.join(dir, "agent-shopping.json"),
    );
    await store.load();
  });

  afterEach(async () => {
    if (prevAbuse === undefined) delete process.env.ATOM_COMMERCE_ABUSE;
    else process.env.ATOM_COMMERCE_ABUSE = prevAbuse;
    if (prevAttest === undefined) delete process.env.ATOM_COMMERCE_ABUSE_OWNER_ATTESTED;
    else process.env.ATOM_COMMERCE_ABUSE_OWNER_ATTESTED = prevAttest;
    await new Promise((r) => setTimeout(r, 80));
    await rm(dir, { recursive: true, force: true });
  });

  it("defaults Agent Shopping off and blocks intents", () => {
    expect(store.getAgentShoppingEnabled()).toBe(false);
    expect(() => store.assertAgentShoppingOn()).toThrow(CommerceAbuseError);
  });

  it("rate-limits inbound intents per issuer", () => {
    for (let i = 0; i < ABUSE_DEFAULTS.intentPerIssuerPerWindow; i++) {
      store.assertInboundIntentAllowed("did:peer:a");
    }
    expect(() => store.assertInboundIntentAllowed("did:peer:a")).toThrow(/rate limited/i);
  });

  it("reserves Session mint budget and releases on failure path", () => {
    process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET = "2";
    const a = store.reserveSessionMint("ws1");
    const b = store.reserveSessionMint("ws1");
    expect(() => store.reserveSessionMint("ws1")).toThrow(/mint budget/i);
    store.releaseSessionMint(a);
    const c = store.reserveSessionMint("ws1");
    store.commitSessionMint(b, "ws1");
    store.commitSessionMint(c, "ws1");
    expect(() => store.reserveSessionMint("ws1")).toThrow(/mint budget/i);
  });

  it("peek mint budget without reserving", () => {
    process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET = "1";
    store.assertSessionMintBudgetAvailable("ws-peek");
    const id = store.reserveSessionMint("ws-peek");
    expect(() => store.assertSessionMintBudgetAvailable("ws-peek")).toThrow(/mint budget/i);
    store.releaseSessionMint(id);
    store.assertSessionMintBudgetAvailable("ws-peek");
  });

  it("peek inbound intent without double-counting", () => {
    process.env.ATOM_COMMERCE_INTENT_RATE = "2";
    store.assertInboundIntentBudgetAvailable("did:peer:peek");
    store.assertInboundIntentAllowed("did:peer:peek");
    store.assertInboundIntentBudgetAvailable("did:peer:peek");
    store.assertInboundIntentAllowed("did:peer:peek");
    expect(() => store.assertInboundIntentBudgetAvailable("did:peer:peek")).toThrow(/rate limited/i);
    expect(() => store.assertInboundIntentAllowed("did:peer:peek")).toThrow(/rate limited/i);
  });

  it("kill-switch off without attestation fails closed", () => {
    process.env.ATOM_COMMERCE_ABUSE = "off";
    expect(() => store.assertInboundIntentAllowed("did:x")).toThrow(/attestation/i);
  });

  it("kill-switch off with attestation allows unlimited", () => {
    process.env.ATOM_COMMERCE_ABUSE = "off";
    store.attestAbuseKillSwitch();
    for (let i = 0; i < 50; i++) {
      store.assertInboundIntentAllowed("did:flood");
    }
  });

  it("kill-switch off ignores env attestation bypass", () => {
    process.env.ATOM_COMMERCE_ABUSE = "off";
    process.env.ATOM_COMMERCE_ABUSE_OWNER_ATTESTED = "1";
    expect(() => store.assertInboundIntentAllowed("did:x")).toThrow(/attestation/i);
  });

  it("suggest-mute after threshold rate_limited declines", () => {
    let last = { suggestMute: false };
    for (let i = 0; i < ABUSE_DEFAULTS.suggestMuteThreshold; i++) {
      last = store.recordRateLimitedDecline("did:bad");
    }
    expect(last.suggestMute).toBe(true);
    store.dismissSuggestMute("did:bad");
    expect(store.listSuggestMutes()).toEqual([]);
  });

  it("suggest-mute dismiss cooldown suppresses re-suggest", () => {
    for (let i = 0; i < ABUSE_DEFAULTS.suggestMuteThreshold; i++) {
      store.recordRateLimitedDecline("did:cool");
    }
    expect(store.listSuggestMutes().some((m) => m.peerDid === "did:cool")).toBe(true);
    store.dismissSuggestMute("did:cool", 24);
    expect(store.listSuggestMutes()).toEqual([]);
    const again = store.recordRateLimitedDecline("did:cool");
    expect(again.suggestMute).toBe(false);
  });

  it("buyer intent velocity and offer pair rates", () => {
    process.env.ATOM_COMMERCE_BUYER_INTENT_RATE = "2";
    process.env.ATOM_COMMERCE_OFFER_RATE = "2";
    store.assertBuyerIntentVelocity("ws-b");
    store.assertBuyerIntentVelocity("ws-b");
    expect(() => store.assertBuyerIntentVelocity("ws-b")).toThrow(/rate limited/i);
    store.assertOfferPairAllowed("did:m", "did:b");
    store.assertOfferPairAllowed("did:m", "did:b");
    expect(() => store.assertOfferPairAllowed("did:m", "did:b")).toThrow(/rate limited/i);
  });

  it("decline outbound cap returns false when exhausted", () => {
    process.env.ATOM_COMMERCE_DECLINE_RATE = "2";
    expect(store.assertDeclineAllowed("did:m", "did:b")).toBe(true);
    expect(store.assertDeclineAllowed("did:m", "did:b")).toBe(true);
    expect(store.assertDeclineAllowed("did:m", "did:b")).toBe(false);
  });

  it("concurrent mint reservations respect budget", () => {
    process.env.ATOM_COMMERCE_SESSION_MINT_BUDGET = "3";
    const ids = Array.from({ length: 3 }, () => store.reserveSessionMint("ws-race"));
    expect(ids).toHaveLength(3);
    expect(() => store.reserveSessionMint("ws-race")).toThrow(/mint budget/i);
    for (const id of ids) store.releaseSessionMint(id);
    store.reserveSessionMint("ws-race");
  });

  it("corrupt abuse file fails closed until recovered", async () => {
    const { writeFile } = await import("node:fs/promises");
    const corruptDir = await mkdtemp(path.join(tmpdir(), "atom-abuse-corrupt-"));
    const abusePath = path.join(corruptDir, "commerce-abuse-counters.json");
    const shoppingPath = path.join(corruptDir, "agent-shopping.json");
    await writeFile(abusePath, "{not-json", "utf8");
    const broken = new CommerceAbuseStore(abusePath, shoppingPath);
    await broken.load();
    expect(broken.isReady()).toBe(false);
    expect(() => broken.assertInboundIntentAllowed("did:x")).toThrow(CommerceAbuseError);
    expect(() => broken.assertInboundIntentAllowed("did:x")).toThrow(/not ready/i);
    await rm(corruptDir, { recursive: true, force: true });
  });

  it("unknown schemaVersion on existing file fails closed", async () => {
    const { writeFile } = await import("node:fs/promises");
    const verDir = await mkdtemp(path.join(tmpdir(), "atom-abuse-ver-"));
    const abusePath = path.join(verDir, "commerce-abuse-counters.json");
    const shoppingPath = path.join(verDir, "agent-shopping.json");
    await writeFile(
      abusePath,
      JSON.stringify({ schemaVersion: 99, buckets: {}, loadedOk: true }),
      "utf8",
    );
    const broken = new CommerceAbuseStore(abusePath, shoppingPath);
    await broken.load();
    expect(broken.isReady()).toBe(false);
    await rm(verDir, { recursive: true, force: true });
  });
});
