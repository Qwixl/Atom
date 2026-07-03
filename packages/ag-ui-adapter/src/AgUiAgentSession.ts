import { HttpAgent, type AgentSubscriber } from "@ag-ui/client";
import { v4 as uuid } from "uuid";
import {
  SessionEmitter,
  type AgentSession,
  type JsonValue,
  type UiEvent,
} from "@qwixl/shell-core";
import { mapCustomEventToOutput, resetA2uiAssembler } from "./atom-events.js";

export interface AgUiAgentConfig {
  /** AG-UI agent endpoint (POST, SSE response). */
  url: string;
  threadId?: string;
  headers?: Record<string, string>;
}

/**
 * AgentSession backed by an AG-UI HttpAgent. Translates the AG-UI event stream
 * into shell-core AgentOutput; outbound shell messages become user messages on
 * the AG-UI thread (same wire shape as @qwixl/agent-llm for backend parity).
 */
export class AgUiAgentSession extends SessionEmitter implements AgentSession {
  private agent: HttpAgent;
  private inFlight = false;
  private queued: string[] = [];
  private disposed = false;
  private textBuffers = new Map<string, string>();

  constructor(config: AgUiAgentConfig) {
    super();
    this.agent = new HttpAgent({
      url: config.url,
      threadId: config.threadId ?? uuid(),
      headers: config.headers,
    });
  }

  sendUserMessage(text: string): void {
    this.enqueue(text);
  }

  sendUiEvent(event: UiEvent): void {
    this.enqueue(
      `[ui-event] ${JSON.stringify({
        surfaceId: event.surfaceId,
        nodeId: event.nodeId,
        name: event.name,
        payload: event.payload ?? null,
      })}`,
    );
  }

  sendActionDecision(actionId: string, decision: "approved" | "declined"): void {
    this.enqueue(`[action-decision] ${JSON.stringify({ actionId, decision })}`);
  }

  sendDataDisclosure(
    requestId: string,
    decision: "approved" | "declined",
    records: Array<{ category: string; label: string; value: JsonValue }>,
  ): void {
    const payload =
      decision === "approved" ? { requestId, decision, records } : { requestId, decision };
    this.enqueue(`[data-disclosure] ${JSON.stringify(payload)}`);
  }

  dispose(): void {
    this.disposed = true;
    this.agent.abortRun();
  }

  private enqueue(content: string): void {
    this.queued.push(content);
    if (!this.inFlight) void this.drain();
  }

  private async drain(): Promise<void> {
    this.inFlight = true;
    try {
      while (this.queued.length > 0 && !this.disposed) {
        const batch = this.queued.splice(0, this.queued.length);
        for (const content of batch) {
          this.agent.messages.push({ id: uuid(), role: "user", content });
        }
        await this.runOnce();
      }
    } finally {
      this.inFlight = false;
      if (!this.disposed) this.emit({ type: "done" });
    }
  }

  private async runOnce(): Promise<void> {
    resetA2uiAssembler();
    const subscriber: AgentSubscriber = {
      onTextMessageContentEvent: ({ event }) => {
        const prev = this.textBuffers.get(event.messageId) ?? "";
        this.textBuffers.set(event.messageId, prev + event.delta);
      },
      onTextMessageEndEvent: ({ event }) => {
        const text = this.textBuffers.get(event.messageId)?.trim();
        this.textBuffers.delete(event.messageId);
        if (text) this.emit({ type: "text", text });
      },
      onCustomEvent: ({ event }) => {
        const output = mapCustomEventToOutput(event);
        if (output) this.emit(output);
      },
      onRunErrorEvent: ({ event }) => {
        this.emit({
          type: "text",
          text: `Agent run error: ${event.message ?? "unknown error"}`,
        });
      },
    };

    try {
      await this.agent.runAgent({}, subscriber);
    } catch (error) {
      this.emit({
        type: "text",
        text: `Could not reach the AG-UI agent: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
