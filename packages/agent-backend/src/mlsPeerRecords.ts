import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import { resolveDataPath } from "./dataDir.js";

const PEERS_FILE = "mls-peers.json";
const SCHEMA_VERSION = 1;

export interface StoredMlsPeer {
  peerDid: string;
  peerUrl?: string;
  connectedAt: number;
}

interface PeersFile {
  schemaVersion: number;
  peers: StoredMlsPeer[];
}

export class MlsPeerRecordStore {
  private peers = new Map<string, StoredMlsPeer>();
  private readonly filePath: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath = resolveDataPath(PEERS_FILE)) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    const file = await readJsonFile<PeersFile>(this.filePath);
    if (!file?.peers?.length) return;
    this.peers.clear();
    for (const peer of file.peers) {
      this.peers.set(peer.peerDid, peer);
    }
  }

  list(): StoredMlsPeer[] {
    return [...this.peers.values()].sort((a, b) => b.connectedAt - a.connectedAt);
  }

  remember(peerDid: string, peerUrl?: string): void {
    const existing = this.peers.get(peerDid);
    this.peers.set(peerDid, {
      peerDid,
      peerUrl: peerUrl?.trim() || existing?.peerUrl,
      connectedAt: Date.now(),
    });
    void this.persist();
  }

  remove(peerDid: string): void {
    if (this.peers.delete(peerDid)) void this.persist();
  }

  private persist(): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        await atomicWriteJson(this.filePath, {
          schemaVersion: SCHEMA_VERSION,
          peers: this.list(),
        } satisfies PeersFile);
      })
      .catch((error) => {
        console.warn(
          `[mls-peers] persist failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
