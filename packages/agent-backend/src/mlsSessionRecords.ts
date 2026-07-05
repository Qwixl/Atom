import { atomicWriteJson, readJsonFile } from "@qwixl/owner-store/file-persistence";
import type { MlsGroupSnapshot, MlsPairSnapshot, SerializedKeyPackages } from "@qwixl/mls-session";
import { resolveDataPath } from "./dataDir.js";

const SESSIONS_FILE = "mls-sessions.json";
const SCHEMA_VERSION = 2;

export interface StoredPairSession {
  snapshot: MlsPairSnapshot;
  packages: SerializedKeyPackages;
}

export interface StoredGroupSession {
  snapshot: MlsGroupSnapshot;
  packages: SerializedKeyPackages;
}

interface SessionsFile {
  schemaVersion: number;
  pairSessions: StoredPairSession[];
  groupSessions: StoredGroupSession[];
}

function emptyFile(): SessionsFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    pairSessions: [],
    groupSessions: [],
  };
}

export class MlsSessionRecordStore {
  private pairSessions = new Map<string, StoredPairSession>();
  private groupSessions = new Map<string, StoredGroupSession>();
  private readonly filePath: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath = resolveDataPath(SESSIONS_FILE)) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    const file = await readJsonFile<SessionsFile>(this.filePath);
    if (!file) return;
    this.pairSessions.clear();
    this.groupSessions.clear();
    for (const entry of file.pairSessions ?? []) {
      if (entry.snapshot.peerDid) {
        this.pairSessions.set(entry.snapshot.peerDid, entry);
      }
    }
    for (const entry of file.groupSessions ?? []) {
      this.groupSessions.set(entry.snapshot.roomId, entry);
    }
  }

  getPairSession(peerDid: string): StoredPairSession | undefined {
    return this.pairSessions.get(peerDid);
  }

  setPairSession(entry: StoredPairSession): void {
    if (!entry.snapshot.peerDid) return;
    this.pairSessions.set(entry.snapshot.peerDid, entry);
    void this.persist();
  }

  deletePairSession(peerDid: string): void {
    if (this.pairSessions.delete(peerDid)) void this.persist();
  }

  listPairSessions(): StoredPairSession[] {
    return [...this.pairSessions.values()];
  }

  getGroupSession(roomId: string): StoredGroupSession | undefined {
    return this.groupSessions.get(roomId);
  }

  setGroupSession(entry: StoredGroupSession): void {
    this.groupSessions.set(entry.snapshot.roomId, entry);
    void this.persist();
  }

  deleteGroupSession(roomId: string): void {
    if (this.groupSessions.delete(roomId)) void this.persist();
  }

  listGroupSessions(): StoredGroupSession[] {
    return [...this.groupSessions.values()];
  }

  private persist(): void {
    this.persistQueue = this.persistQueue
      .then(async () => {
        await atomicWriteJson(this.filePath, {
          schemaVersion: SCHEMA_VERSION,
          pairSessions: this.listPairSessions(),
          groupSessions: this.listGroupSessions(),
        } satisfies SessionsFile);
      })
      .catch((error) => {
        console.warn(
          `[mls-sessions] persist failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
