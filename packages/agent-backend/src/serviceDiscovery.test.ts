import { describe, expect, it } from "vitest";
import type { BusinessIndexEntry } from "@qwixl/business-index";
import {
  buildAgentCapabilities,
  matchesDiscoverCapabilities,
  resolveDiscoverEntry,
  type AgentCapabilities,
} from "./serviceDiscovery.js";
import type { AgentBackendConfig } from "./config.js";
import { RoomStore } from "./roomStore.js";

describe("serviceDiscovery", () => {
  const entry: BusinessIndexEntry = {
    businessDomain: "coffee-shop.agents.qwixl.dev",
    verificationTier: 1,
    categories: ["community"],
    displayName: "Qwixl Coffee Shop",
    kind: "community",
    moduleIds: ["community/coffee-shop"],
    roomIds: ["room:coffeeshop"],
  };

  it("matches module and room ids", () => {
    const cap: AgentCapabilities = {
      did: "did:key:host",
      publicBaseUrl: "http://127.0.0.1:5204",
      agentCardUrl: "http://127.0.0.1:5204/a2a/jsonrpc",
      moduleIds: ["community/coffee-shop"],
      roomIds: ["room:coffeeshop"],
    };
    expect(matchesDiscoverCapabilities(cap, entry)).toBe(true);
  });

  it("resolves locally when this agent hosts the module", async () => {
    const rooms = new RoomStore();
    const config: AgentBackendConfig = {
      port: 5204,
      host: "127.0.0.1",
      publicBaseUrl: "http://127.0.0.1:5204",
      agentName: "Host",
      allowedOrigins: new Set(),
      stripeSecretKey: null,
      stripePublishableKey: null,
      stripeProductId: null,
      businessMode: false,
      businessDomain: null,
      demoPeerMode: false,
    communityHostMode: true,
    businessKnowledgeBackend: "json",
    businessKnowledgeRemoteUrl: null,
    interactivePortResolve: false,
    brainAlwaysOn: true,
    brainIntervalMs: 60000,
    agentKind: "owner",
    killSwitch: false,
    };
    const localCapabilities = buildAgentCapabilities({
      config,
      localDid: "did:key:host",
      rooms,
      businessDomain: entry.businessDomain,
    });
    const resolved = await resolveDiscoverEntry({ entry, localCapabilities });
    expect(resolved.resolvedVia).toBe("local");
    expect(resolved.adminBase).toBe("http://127.0.0.1:5204");
    expect(resolved.did).toBe("did:key:host");
  });
});
