import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateAgentKeyPair } from "@qwixl/protocol";
import type { AgentBackendConfig } from "./config.js";
import { HandleCacheStore } from "./handleCache.js";
import { RoomStore } from "./roomStore.js";
import { runDiscoverSearch } from "./discoverSearch.js";

vi.mock("@qwixl/business-index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qwixl/business-index")>();
  return {
    ...actual,
    fetchBusinessIndex: vi.fn(async (url: string) => {
      if (url.includes("community-index")) {
        return {
          indexVersion: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          revocationsUrl: "revocations.json",
          businesses: [
            {
              kind: "community",
              businessDomain: "coffee-shop.agents.qwixl.dev",
              verificationTier: 1,
              tierLabel: "Community",
              categories: ["community"],
              serviceArea: "Global",
              displayName: "Qwixl Coffee Shop",
              moduleIds: ["community/coffee-shop"],
              roomIds: ["room:coffeeshop"],
              publisherDid: "did:key:z6Mkatomexamples01",
            },
          ],
        };
      }
      return {
        indexVersion: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        revocationsUrl: "revocations.json",
        businesses: [],
      };
    }),
    fetchHandleIndex: vi.fn(async () => ({ indexVersion: 1, handles: [] })),
  };
});

vi.mock("./serviceDiscovery.js", () => ({
  buildAgentCapabilities: vi.fn(() => ({})),
  resolveDiscoverEntry: vi.fn(async ({ entry }: { entry: { displayName: string } }) => ({
    adminBase: "http://127.0.0.1:59999",
    agentCardUrl: "http://127.0.0.1:59999/a2a/jsonrpc",
    did: "did:key:z6Mkhost",
    resolvedVia: "localhost-probe",
  })),
}));

const baseConfig: AgentBackendConfig = {
  port: 5204,
  host: "127.0.0.1",
  publicBaseUrl: "http://127.0.0.1:5204",
  agentName: "test",
  allowedOrigins: new Set(),
  stripeSecretKey: null,
  stripePublishableKey: null,
  stripeProductId: null,
  businessMode: false,
  businessDomain: null,
  demoPeerMode: false,
  communityHostMode: false,
  businessKnowledgeBackend: "json",
  businessKnowledgeRemoteUrl: null,
  interactivePortResolve: false,
  brainAlwaysOn: true,
  brainIntervalMs: 60000,
  agentKind: "owner",
  killSwitch: false,
};

describe("runDiscoverSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns community matches for coffee terms using caller index base", async () => {
    const identity = await generateAgentKeyPair();
    const rooms = new RoomStore();
    const { results, summary } = await runDiscoverSearch({
      terms: "coffee shop",
      config: baseConfig,
      identity,
      rooms,
      handleCache: new HandleCacheStore(),
      indexBaseUrl: "http://127.0.0.1:5200",
      indexes: [{ label: "Community", url: "/community-index/index.json" }],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.entry.displayName).toBe("Qwixl Coffee Shop");
    expect(summary).toContain("one place");
  });

  it("returns empty summary when nothing resolves online", async () => {
    const identity = await generateAgentKeyPair();
    const rooms = new RoomStore();
    const { results, summary } = await runDiscoverSearch({
      terms: "quantum florist",
      config: baseConfig,
      identity,
      rooms,
      handleCache: new HandleCacheStore(),
      indexBaseUrl: "http://127.0.0.1:5200",
    });

    expect(results).toHaveLength(0);
    expect(summary).toContain("couldn't find anything");
  });
});
