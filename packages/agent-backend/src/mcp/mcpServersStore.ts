import { loadJsonStore, createJsonStoreWriter } from "../persistedJsonStore.js";
import { resolveDataPath } from "../dataDir.js";
import type { StoredMcpServer } from "./types.js";
import { isMcpServerTrusted } from "./types.js";

const FILE = "mcp-servers.json";

interface McpServersSnapshot {
  schemaVersion: 1;
  servers: StoredMcpServer[];
}

export class McpServersStore {
  private servers: StoredMcpServer[] = [];
  private readonly filePath = resolveDataPath(FILE);
  private readonly writer = createJsonStoreWriter<McpServersSnapshot>(
    this.filePath,
    1,
    "McpServersStore",
    () => ({ servers: this.servers }),
  );

  async load(): Promise<void> {
    await loadJsonStore<McpServersSnapshot>(this.filePath, (data) => {
      this.servers = data?.servers ?? [];
    });
  }

  list(): StoredMcpServer[] {
    return [...this.servers];
  }

  listEnabled(): StoredMcpServer[] {
    return this.servers.filter((server) => server.enabled && isMcpServerTrusted(server));
  }

  listTrusted(): StoredMcpServer[] {
    return this.servers.filter((server) => isMcpServerTrusted(server));
  }

  get(id: string): StoredMcpServer | undefined {
    return this.servers.find((server) => server.id === id);
  }

  async add(server: StoredMcpServer): Promise<void> {
    if (this.servers.some((entry) => entry.id === server.id)) {
      throw new Error(`MCP server already exists: ${server.id}`);
    }
    this.servers.push(server);
    this.writer.persist();
    await this.writer.flush();
  }

  async remove(id: string): Promise<boolean> {
    const before = this.servers.length;
    this.servers = this.servers.filter((server) => server.id !== id);
    if (this.servers.length === before) return false;
    this.writer.persist();
    await this.writer.flush();
    return true;
  }

  async updateAllowedTools(id: string, allowedTools: string[]): Promise<void> {
    const server = this.get(id);
    if (!server) throw new Error(`Unknown MCP server: ${id}`);
    server.allowedTools = [...allowedTools];
    // Drop safeTools that are no longer allowlisted.
    if (server.safeTools?.length) {
      server.safeTools = server.safeTools.filter((tool) => allowedTools.includes(tool));
    }
    this.writer.persist();
    await this.writer.flush();
  }

  async updateSafeTools(id: string, safeTools: string[]): Promise<void> {
    const server = this.get(id);
    if (!server) throw new Error(`Unknown MCP server: ${id}`);
    if (server.allowedTools.length === 0 && safeTools.length > 0) {
      throw new Error("safeTools requires a non-empty allowedTools list");
    }
    const next = [...new Set(safeTools.map((tool) => tool.trim()).filter(Boolean))];
    for (const tool of next) {
      if (!server.allowedTools.includes(tool)) {
        throw new Error(`safeTools entry not in allowedTools: ${tool}`);
      }
    }
    server.safeTools = next;
    this.writer.persist();
    await this.writer.flush();
  }

  async trustServer(id: string): Promise<void> {
    const server = this.get(id);
    if (!server) throw new Error(`Unknown MCP server: ${id}`);
    server.trusted = true;
    server.trustedAt = Date.now();
    this.writer.persist();
    await this.writer.flush();
  }
}
