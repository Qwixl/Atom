import type { DataObject } from "@qwixl/protocol";
import type { ReceivedDataObjectEvent } from "@qwixl/a2a-transport";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";
import { resolveDataPath } from "./dataDir.js";
import { createJsonStoreWriter, loadJsonStore } from "./persistedJsonStore.js";

export interface InboxEntry extends ReceivedDataObjectEvent {
  receivedAt: string;
}

const INBOX_FILE = "inbox.json";
const SCHEMA_VERSION = 1;
const MAX_INBOX_ENTRIES = 500;

interface InboxFile {
  schemaVersion: number;
  entries: InboxEntry[];
}

export class DataObjectInbox {
  static readonly storeMeta = AGENT_STORE_REGISTRY.inbox;
  private readonly entries: InboxEntry[] = [];
  private readonly filePath: string;
  private readonly writer: ReturnType<typeof createJsonStoreWriter<InboxFile>>;

  constructor(filePath = resolveDataPath(INBOX_FILE)) {
    this.filePath = filePath;
    this.writer = createJsonStoreWriter<InboxFile>(
      this.filePath,
      SCHEMA_VERSION,
      "inbox",
      () => ({ entries: this.entries.slice(-MAX_INBOX_ENTRIES) }),
    );
  }

  async load(): Promise<void> {
    await loadJsonStore<InboxFile>(this.filePath, (file) => {
      this.entries.length = 0;
      for (const entry of file?.entries ?? []) {
        this.entries.push(entry);
      }
    });
  }

  push(event: ReceivedDataObjectEvent): void {
    this.entries.push({ ...event, receivedAt: new Date().toISOString() });
    if (this.entries.length > MAX_INBOX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_INBOX_ENTRIES);
    }
    this.writer.persist();
  }

  list(): InboxEntry[] {
    return [...this.entries];
  }

  get(id: string): InboxEntry | undefined {
    return this.entries.find((entry) => entry.object.id === id);
  }

  latest(): InboxEntry | undefined {
    return this.entries.at(-1);
  }

  count(): number {
    return this.entries.length;
  }
}

export type { DataObject };
