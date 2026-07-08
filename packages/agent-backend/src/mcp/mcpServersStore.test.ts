import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { McpServersStore } from "./mcpServersStore.js";

describe("McpServersStore", () => {
  let dataDir = "";

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "atom-mcp-store-"));
    process.env.ATOM_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    delete process.env.ATOM_DATA_DIR;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it("persists servers across load", async () => {
    const store = new McpServersStore();
    await store.load();
    await store.add({
      id: "demo",
      label: "Demo",
      command: "node",
      args: ["server.js"],
      allowedTools: [],
      enabled: true,
      addedAt: 1,
    });

    const reloaded = new McpServersStore();
    await reloaded.load();
    expect(reloaded.list()).toHaveLength(1);
    expect(reloaded.get("demo")?.command).toBe("node");
  });

  it("updates allowlist", async () => {
    const store = new McpServersStore();
    await store.load();
    await store.add({
      id: "demo",
      label: "Demo",
      command: "node",
      args: [],
      allowedTools: [],
      enabled: true,
      addedAt: 1,
    });
    await store.updateAllowedTools("demo", ["search", "fetch"]);
    expect(store.get("demo")?.allowedTools).toEqual(["search", "fetch"]);
  });

  it("trusts a server", async () => {
    const store = new McpServersStore();
    await store.load();
    await store.add({
      id: "demo",
      label: "Demo",
      command: "node",
      args: [],
      allowedTools: [],
      enabled: true,
      trusted: false,
      addedAt: 1,
    });
    await store.trustServer("demo");
    expect(store.get("demo")?.trusted).toBe(true);
    expect(store.get("demo")?.trustedAt).toBeTypeOf("number");
    expect(store.listEnabled()).toHaveLength(1);
  });

  it("excludes untrusted servers from listEnabled", async () => {
    const store = new McpServersStore();
    await store.load();
    await store.add({
      id: "demo",
      label: "Demo",
      command: "node",
      args: [],
      allowedTools: [],
      enabled: true,
      trusted: false,
      addedAt: 1,
    });
    expect(store.listEnabled()).toHaveLength(0);
  });
});
