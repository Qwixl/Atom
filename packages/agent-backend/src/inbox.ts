import type { DataObject } from "@qwixl/protocol";
import type { ReceivedDataObjectEvent } from "@qwixl/a2a-transport";
import { AGENT_STORE_REGISTRY } from "./storeContracts.js";

export interface InboxEntry extends ReceivedDataObjectEvent {
  receivedAt: string;
}

export class DataObjectInbox {
  static readonly storeMeta = AGENT_STORE_REGISTRY.inbox;
  private readonly entries: InboxEntry[] = [];

  push(event: ReceivedDataObjectEvent): void {
    this.entries.push({ ...event, receivedAt: new Date().toISOString() });
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
