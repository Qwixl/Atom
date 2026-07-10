import type { Catalog } from "./catalog.js";
import {
  appendAgentText,
  appendUserMessage,
  clearFeed,
  patchSurfaceNodeProps,
  upsertFeedSurface,
  type FeedItem,
} from "./conversation.js";
import { buildDataRequestChrome, type PendingChrome } from "./chrome.js";
import { resolveComposition } from "./resolver.js";
import type { Composition, JsonObject, JsonValue } from "./types.js";
import type { AgentOutput, AgentSession } from "./session.js";

export interface ConversationSnapshot {
  feed: readonly FeedItem[];
  busy: boolean;
  pending: PendingChrome | null;
}

export interface TurnCompleteInfo {
  /** True when the agent emitted a composition that updated the feed surface this turn. */
  hadComposition: boolean;
  /** True when the agent emitted a game-move this turn (valid or not). */
  hadGameMove: boolean;
}

export interface ConversationRuntimeOptions {
  catalog: Catalog;
  /** Runs before resolve (e.g. registry module install). Errors are reported, not thrown. */
  beforeResolveComposition?: (composition: Composition) => Promise<void>;
  onRegistryError?: (message: string) => void;
  /** Guarded record count for data-request chrome terms. */
  guardedRecordCount?: (categories: string[]) => number;
  /** Called when agent output type is "done". */
  onTurnComplete?: (info: TurnCompleteInfo) => void;
  /** Assistant/user text appended to the feed (for curator transcript, etc.). */
  onTranscriptLine?: (role: "user" | "assistant", text: string) => void;
  /** Previously persisted feed items to restore on startup (text turns only). */
  restoreFeed?: FeedItem[];
  /** Called after every feed change so hosts can persist history. */
  onFeedChange?: (feed: readonly FeedItem[]) => void;
  /** When false, composition is ignored for surface upsert (feed text may still append). */
  shouldReplaceSurface?: (composition: Composition, feed: readonly FeedItem[]) => boolean;
  /** When false, agent text is omitted from the feed (transcript line may still run). */
  shouldAppendAgentText?: (text: string, feed: readonly FeedItem[]) => boolean;
  /** Agent proposed a game move; host validates via the game engine and updates the surface. */
  onGameMove?: (surfaceId: string, move: JsonValue) => void;
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
  private outputChain: Promise<void> = Promise.resolve();
  private turnHadComposition = false;
  private turnHadGameMove = false;

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

  /** Replace text history (e.g. after custody sync). Surfaces are dropped. */
  replaceTextFeed(items: readonly FeedItem[]): void {
    const textOnly = items.filter(
      (item): item is Extract<FeedItem, { kind: "user" | "agent-text" }> =>
        item.kind === "user" || item.kind === "agent-text",
    );
    this.feed = [...textOnly];
    this.idCounter = 0;
    for (const item of textOnly) {
      const numeric = Number(/^item-(\d+)$/.exec(item.id)?.[1]);
      if (Number.isFinite(numeric) && numeric > this.idCounter) this.idCounter = numeric;
    }
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

  /**
   * Inject an agent-text line with a stable id (e.g. brain notification id for dedup).
   * Skips if that id is already on the feed.
   */
  appendAgentTextWithId(
    id: string,
    text: string,
    meta?: { origin?: "brain"; brainKind?: "daily-briefing" | "reminder" | "watch" },
  ): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (this.feed.some((item) => item.id === id)) return false;
    this.feed = appendAgentText(this.feed, id, trimmed, meta);
    this.notify();
    return true;
  }

  /** Update props on a module node within an active surface (e.g. live game state). */
  updateSurfaceModuleProps(
    surfaceId: string,
    componentName: string,
    propsPatch: JsonObject,
  ): boolean {
    const index = this.feed.findIndex(
      (item) => item.kind === "surface" && item.surface.surfaceId === surfaceId,
    );
    if (index < 0) return false;
    const item = this.feed[index];
    if (!item || item.kind !== "surface") return false;
    const surface = patchSurfaceNodeProps(item.surface, componentName, propsPatch);
    const next = [...this.feed];
    next[index] = { kind: "surface", id: item.id, surface };
    this.feed = next;
    this.notify();
    return true;
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

  /** Mount or replace the active surface from a composition (shell-owned modules). */
  async showComposition(composition: Composition): Promise<void> {
    await this.handleAgentOutput({ type: "composition", composition });
  }

  async handleAgentOutput(output: AgentOutput): Promise<void> {
    const id = this.nextId();
    switch (output.type) {
      case "text": {
        const append =
          !this.options.shouldAppendAgentText ||
          this.options.shouldAppendAgentText(output.text, this.feed);
        if (append) {
          this.feed = appendAgentText(this.feed, id, output.text);
        }
        this.options.onTranscriptLine?.("assistant", output.text);
        break;
      }
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
        if (
          this.options.shouldReplaceSurface &&
          !this.options.shouldReplaceSurface(output.composition, this.feed)
        ) {
          if (typeof console !== "undefined") {
            console.warn(
              "[ConversationRuntime] composition dropped by shouldReplaceSurface",
              output.composition.surfaceId,
            );
          }
          break;
        }
        this.feed = upsertFeedSurface(this.feed, surface, id);
        this.turnHadComposition = true;
        if (typeof console !== "undefined") {
          console.debug(
            "[ConversationRuntime] surface upserted",
            output.composition.surfaceId,
            surface.root.node.component,
          );
        }
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
      case "game-move":
        this.turnHadGameMove = true;
        this.options.onGameMove?.(output.surfaceId, output.move);
        break;
      case "done":
        this.busy = false;
        this.options.onTurnComplete?.({
          hadComposition: this.turnHadComposition,
          hadGameMove: this.turnHadGameMove,
        });
        this.turnHadComposition = false;
        this.turnHadGameMove = false;
        break;
    }
    this.notify();
  }

  private enqueueAgentOutput(output: AgentOutput): void {
    this.outputChain = this.outputChain
      .then(() => this.handleAgentOutput(output))
      .catch((error) => {
        console.error("[ConversationRuntime] failed to handle agent output:", error);
      });
  }

  /** Subscribe session output to this runtime; returns unsubscribe. */
  wireSession(session: AgentSession): () => void {
    return session.subscribe((output) => this.enqueueAgentOutput(output));
  }

  /**
   * Attach a session without dropping in-flight outputs from the prior session.
   * Defers unsubscribing the previous listener so synchronous emits finishing a
   * turn still reach the output chain.
   */
  bindSession(session: AgentSession): void {
    const listener = (output: AgentOutput) => this.enqueueAgentOutput(output);
    const unsub = session.subscribe(listener);
    const prev = this.sessionUnsub;
    this.sessionUnsub = unsub;
    if (prev) queueMicrotask(prev);
  }

  private sessionUnsub: (() => void) | null = null;

  private nextId(): string {
    return `item-${++this.idCounter}`;
  }

  private notify(): void {
    this.snapshot = { feed: this.feed, busy: this.busy, pending: this.pending };
    this.options.onFeedChange?.(this.feed);
    for (const listener of this.listeners) listener();
  }
}
