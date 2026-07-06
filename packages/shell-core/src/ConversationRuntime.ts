import type { Catalog } from "./catalog.js";
import {
  appendAgentText,
  appendUserMessage,
  clearFeed,
  upsertFeedSurface,
  type FeedItem,
} from "./conversation.js";
import { buildDataRequestChrome, type PendingChrome } from "./chrome.js";
import { resolveComposition } from "./resolver.js";
import type { Composition } from "./types.js";
import type { AgentOutput, AgentSession } from "./session.js";

export interface ConversationSnapshot {
  feed: readonly FeedItem[];
  busy: boolean;
  pending: PendingChrome | null;
}

export interface ConversationRuntimeOptions {
  catalog: Catalog;
  /** Runs before resolve (e.g. registry module install). Errors are reported, not thrown. */
  beforeResolveComposition?: (composition: Composition) => Promise<void>;
  onRegistryError?: (message: string) => void;
  /** Guarded record count for data-request chrome terms. */
  guardedRecordCount?: (categories: string[]) => number;
  /** Called when agent output type is "done". */
  onTurnComplete?: () => void;
  /** Assistant/user text appended to the feed (for curator transcript, etc.). */
  onTranscriptLine?: (role: "user" | "assistant", text: string) => void;
  /** Previously persisted feed items to restore on startup (text turns only). */
  restoreFeed?: FeedItem[];
  /** Called after every feed change so hosts can persist history. */
  onFeedChange?: (feed: readonly FeedItem[]) => void;
}

/**
 * Headless conversation state: feed policy, busy flag, pending chrome.
 * Host apps wire AgentSession.subscribe → handleAgentOutput and render chrome.
 */
export class ConversationRuntime {
  private feed: FeedItem[] = [];
  private busy = false;
  private pending: PendingChrome | null = null;
  private listeners = new Set<() => void>();
  private idCounter = 0;
  private snapshot: ConversationSnapshot = { feed: [], busy: false, pending: null };

  constructor(private readonly options: ConversationRuntimeOptions) {
    const restored = options.restoreFeed;
    if (restored?.length) {
      this.feed = [...restored];
      for (const item of restored) {
        const numeric = Number(/^item-(\d+)$/.exec(item.id)?.[1]);
        if (Number.isFinite(numeric) && numeric > this.idCounter) this.idCounter = numeric;
      }
      this.snapshot = { feed: this.feed, busy: false, pending: null };
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): ConversationSnapshot {
    return this.snapshot;
  }

  reset(): void {
    this.feed = clearFeed();
    this.busy = false;
    this.pending = null;
    this.notify();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.notify();
  }

  clearPending(): void {
    this.pending = null;
    this.notify();
  }

  appendUser(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.feed = appendUserMessage(this.feed, this.nextId(), trimmed);
    this.options.onTranscriptLine?.("user", trimmed);
    this.busy = true;
    this.notify();
  }

  appendLocalAgentText(text: string): void {
    this.feed = appendAgentText(this.feed, this.nextId(), text);
    this.notify();
  }

  appendUserAndAgentText(userText: string, agentText: string): void {
    const trimmed = userText.trim();
    if (!trimmed) return;
    this.feed = appendAgentText(
      appendUserMessage(this.feed, this.nextId(), trimmed),
      this.nextId(),
      agentText,
    );
    this.notify();
  }

  async handleAgentOutput(output: AgentOutput): Promise<void> {
    const id = this.nextId();
    switch (output.type) {
      case "text":
        this.feed = appendAgentText(this.feed, id, output.text);
        this.options.onTranscriptLine?.("assistant", output.text);
        break;
      case "composition": {
        if (this.options.beforeResolveComposition) {
          try {
            await this.options.beforeResolveComposition(output.composition);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.options.onRegistryError?.(message);
            console.error("Registry module install failed:", error);
          }
        }
        const surface = resolveComposition(output.composition, this.options.catalog);
        this.feed = upsertFeedSurface(this.feed, surface, id);
        break;
      }
      case "consequential-action":
        this.pending = {
          surfaceId: output.surfaceId,
          action: output.action,
        };
        break;
      case "data-request": {
        const count =
          this.options.guardedRecordCount?.(output.request.categories) ?? 0;
        this.pending = buildDataRequestChrome(output.request, count);
        break;
      }
      case "done":
        this.busy = false;
        this.options.onTurnComplete?.();
        break;
    }
    this.notify();
  }

  /** Subscribe session output to this runtime; returns unsubscribe. */
  wireSession(session: AgentSession): () => void {
    return session.subscribe((output) => {
      void this.handleAgentOutput(output);
    });
  }

  private nextId(): string {
    return `item-${++this.idCounter}`;
  }

  private notify(): void {
    this.snapshot = { feed: this.feed, busy: this.busy, pending: this.pending };
    this.options.onFeedChange?.(this.feed);
    for (const listener of this.listeners) listener();
  }
}
