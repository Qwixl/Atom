import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TrustedAgentsStore } from "./trustedAgentsStore.js";

describe("TrustedAgentsStore", () => {
  it("blocks outbound and inbound for blocked contacts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-contacts-"));
    const store = new TrustedAgentsStore(path.join(dir, "trusted-agents.json"));
    store.upsert({
      did: "did:key:alice",
      endpoint: "http://127.0.0.1:1/a2a/jsonrpc",
      blocked: true,
    });

    expect(store.shouldAllowOutbound("did:key:alice")).toBe(false);
    expect(store.shouldAcceptInbound("did:key:alice")).toBe(false);
    expect(store.shouldAcceptInbound("did:key:stranger")).toBe(true);
  });

  it("drops inbound for muted contacts but allows outbound", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-contacts-"));
    const store = new TrustedAgentsStore(path.join(dir, "trusted-agents.json"));
    store.upsert({
      did: "did:key:bob",
      endpoint: "http://127.0.0.1:2/a2a/jsonrpc",
      muted: true,
    });

    expect(store.shouldAllowOutbound("did:key:bob")).toBe(true);
    expect(store.shouldAcceptInbound("did:key:bob")).toBe(false);
  });

  it("syncAll replaces the contact list", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "atom-contacts-"));
    const filePath = path.join(dir, "trusted-agents.json");
    const store = new TrustedAgentsStore(filePath);
    store.upsert({
      did: "did:key:old",
      endpoint: "http://127.0.0.1:9/a2a/jsonrpc",
    });
    store.syncAll([
      {
        did: "did:key:new",
        endpoint: "http://127.0.0.1:3/a2a/jsonrpc",
        blocked: true,
      },
    ]);
    await store.flush();

    expect(store.list()).toHaveLength(1);
    expect(store.get("did:key:old")).toBeUndefined();
    expect(store.get("did:key:new")?.blocked).toBe(true);

    const reloaded = new TrustedAgentsStore(filePath);
    await reloaded.load();
    expect(reloaded.list()).toHaveLength(1);
  });
});
