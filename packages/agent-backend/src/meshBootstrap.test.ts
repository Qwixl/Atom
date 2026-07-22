import { describe, expect, it } from "vitest";
import {
  isExcludedFromMesh,
  normalizePeerUrlForConnect,
  parseMeshPeerUrls,
  peerUrlsFromMeshIndex,
  resolveMeshBootstrapIndexUrl,
  meshBootstrapEnabled,
} from "./meshBootstrap.js";

describe("meshBootstrap", () => {
  it("normalizes base URLs to a2a jsonrpc", () => {
    expect(normalizePeerUrlForConnect("https://5401.agents.atom.qwixl.com")).toBe(
      "https://5401.agents.atom.qwixl.com/a2a/jsonrpc",
    );
    expect(
      normalizePeerUrlForConnect("https://5401.agents.atom.qwixl.com/a2a/jsonrpc"),
    ).toBe("https://5401.agents.atom.qwixl.com/a2a/jsonrpc");
  });

  it("excludes police by kind, handle, id, and port", () => {
    expect(isExcludedFromMesh({ agentKind: "swarm-police" })).toBe(true);
    expect(isExcludedFromMesh({ handle: "@atom-police" })).toBe(true);
    expect(isExcludedFromMesh({ id: "police-monitor" })).toBe(true);
    expect(isExcludedFromMesh({ url: "https://5499.agents.atom.qwixl.com/a2a/jsonrpc" })).toBe(
      true,
    );
    expect(isExcludedFromMesh({ agentKind: "swarm-npc", handle: "@mira" })).toBe(false);
  });

  it("parseMeshPeerUrls drops police and dedupes", () => {
    const urls = parseMeshPeerUrls(
      [
        "https://5401.agents.atom.qwixl.com",
        "https://5401.agents.atom.qwixl.com/a2a/jsonrpc",
        "https://5499.agents.atom.qwixl.com",
        "https://luke.agents.atom.qwixl.com",
      ].join(","),
    );
    expect(urls).toEqual([
      "https://5401.agents.atom.qwixl.com/a2a/jsonrpc",
      "https://luke.agents.atom.qwixl.com/a2a/jsonrpc",
    ]);
  });

  it("peerUrlsFromMeshIndex keeps swarm-npc only", () => {
    const urls = peerUrlsFromMeshIndex({
      businesses: [
        {
          displayName: "Coffee Shop",
          hostUrl: "https://5305.agents.atom.qwixl.com",
        },
        {
          displayName: "Mira",
          agentKind: "swarm-npc",
          hostUrl: "https://5401.agents.atom.qwixl.com",
        },
        {
          displayName: "Police",
          agentKind: "swarm-police",
          hostUrl: "https://5499.agents.atom.qwixl.com",
        },
      ],
      entries: [
        {
          id: "jonah-pastor",
          agentKind: "swarm-npc",
          publicBaseUrl: "https://5402.agents.atom.qwixl.com",
        },
      ],
    });
    expect(urls).toEqual([
      "https://5401.agents.atom.qwixl.com/a2a/jsonrpc",
      "https://5402.agents.atom.qwixl.com/a2a/jsonrpc",
    ]);
  });

  it("meshBootstrapEnabled respects flag and peer config", () => {
    expect(meshBootstrapEnabled({})).toBe(false);
    expect(meshBootstrapEnabled({ ATOM_MESH_BOOTSTRAP: "1" })).toBe(true);
    expect(meshBootstrapEnabled({ ATOM_MESH_BOOTSTRAP: "0" })).toBe(false);
    expect(
      meshBootstrapEnabled({
        ATOM_MESH_PEER_URLS: "https://5401.agents.atom.qwixl.com",
      }),
    ).toBe(true);
  });

  it("resolveMeshBootstrapIndexUrl defaults when bootstrap on", () => {
    expect(resolveMeshBootstrapIndexUrl({ ATOM_MESH_BOOTSTRAP: "1" })).toContain(
      "community-index/index.json",
    );
    expect(resolveMeshBootstrapIndexUrl({})).toBeNull();
    expect(
      resolveMeshBootstrapIndexUrl({
        ATOM_MESH_BOOTSTRAP_INDEX_URL: "https://example.com/index.json",
      }),
    ).toBe("https://example.com/index.json");
  });
});
