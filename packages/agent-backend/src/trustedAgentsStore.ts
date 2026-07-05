import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";

const TRUSTED_AGENTS_FILE = "trusted-agents.json";
const SCHEMA_VERSION = 1;

export interface TrustedAgentEntry {
  did: string;
  endpoint: string;
  name?: string;
  handle?: string;
  kind?: "person" | "business" | "community";
  source?: "invite" | "discover" | "room";
  blocked?: boolean;
  muted?: boolean;
  standingDisclosure?: string[];
  updatedAt: string;
}

interface TrustedAgentsFile {
  schemaVersion: number;
  agents: TrustedAgentEntry[];
}

export class TrustedAgentsStore {
  private agents = new Map<string, TrustedAgentEntry>();
  private readonly filePath: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath = resolveDataPath(TRUSTED_AGENTS_FILE)) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    const file = await readJsonFile<TrustedAgentsFile>(this.filePath);
    if (!file) return;
    this.agents.clear();
    for (const agent of file.agents ?? []) {
      if (agent.did?.trim() && agent.endpoint?.trim()) {
        this.agents.set(agent.did.trim(), agent);
      }
    }
  }

  list(): TrustedAgentEntry[] {
    return [...this.agents.values()].sort((a, b) => a.did.localeCompare(b.did));
  }

  get(did: string): TrustedAgentEntry | undefined {
    return this.agents.get(did.trim());
  }

  upsert(entry: Omit<TrustedAgentEntry, "updatedAt">): TrustedAgentEntry {
    const did = entry.did.trim();
    const stored: TrustedAgentEntry = {
      ...entry,
      did,
      endpoint: entry.endpoint.trim(),
      blocked: entry.blocked === true,
      muted: entry.muted === true,
      updatedAt: new Date().toISOString(),
    };
    this.agents.set(did, stored);
    void this.persist();
    return stored;
  }

  syncAll(entries: Array<Omit<TrustedAgentEntry, "updatedAt">>): TrustedAgentEntry[] {
    const next = new Map<string, TrustedAgentEntry>();
    const now = new Date().toISOString();
    for (const entry of entries) {
      if (!entry.did?.trim() || !entry.endpoint?.trim()) continue;
      const did = entry.did.trim();
      next.set(did, {
        ...entry,
        did,
        endpoint: entry.endpoint.trim(),
        blocked: entry.blocked === true,
        muted: entry.muted === true,
        updatedAt: now,
      });
    }
    this.agents = next;
    void this.persist();
    return this.list();
  }

  isBlocked(did: string): boolean {
    return this.get(did)?.blocked === true;
  }

  isMuted(did: string): boolean {
    return this.get(did)?.muted === true;
  }

  shouldAcceptInbound(issuerDid: string): boolean {
    const entry = this.get(issuerDid);
    if (!entry) return true;
    if (entry.blocked) return false;
    if (entry.muted) return false;
    return true;
  }

  shouldAllowOutbound(peerDid: string | undefined): boolean {
    if (!peerDid?.trim()) return true;
    return !this.isBlocked(peerDid);
  }

  async flush(): Promise<void> {
    await this.persistQueue;
  }

  private persist(): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        await atomicWriteJson(this.filePath, {
          schemaVersion: SCHEMA_VERSION,
          agents: this.list(),
        } satisfies TrustedAgentsFile);
      })
      .catch((error) => {
        console.warn(
          `[contacts] persist failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
