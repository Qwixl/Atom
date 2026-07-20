import { HttpAgent, type AgentSubscriber } from "@ag-ui/client";
import { v4 as uuid } from "uuid";
import { ATOM_AGUI_PROFILE_PROP, type PersonalAgentContext } from "@qwixl/owner-store";
import { resolveAgUiConnectorInvoke } from "@qwixl/agent-llm";
import {
  SessionEmitter,
  presentChatAgentError,
  type AgentSession,
  type JsonValue,
  type UiEvent,
} from "@qwixl/shell-core";
import {
  ATOM_AGUI_EVENTS,
  mapCustomEventToOutput,
  parseConnectorInvokeRequest,
  resetA2uiAssembler,
  type AtomConnectorId,
  type AtomConnectorInvokeRequest,
} from "./atom-events.js";
import { formatConnectorResultMessage } from "./inbound.js";

export type { AtomConnectorId };

export type AtomConnectorInvokeInput = {
  connectorId: AtomConnectorId;
  operation: string;
  input?: Record<string, unknown>;
};

export type AtomConnectorExecutor = (call: AtomConnectorInvokeInput) => Promise<unknown>;

export interface AgUiAgentConfig {
  /** AG-UI agent endpoint (POST, SSE response). */
  url: string;
  threadId?: string;
  headers?: Record<string, string>;
  /** Owner profile + memory forwarded to backend each run (M10.4). */
  profileProvider?: () => PersonalAgentContext;
  /** Shell-side connector reads when the brain emits atom.connector-invoke. */
  connectorExecutor?: AtomConnectorExecutor;
  /** Advertise connector availability to the brain via forwardedProps. */
  connectorsAvailable?: boolean;
}

/**
 * AgentSession backed by an AG-UI HttpAgent. Translates the AG-UI event stream
 * into shell-core AgentOutput; outbound shell messages become user messages on
 * the AG-UI thread (same wire shape as @qwixl/agent-llm for backend parity).
 */
export class AgUiAgentSession extends SessionEmitter implements AgentSession {
  private static readonly MAX_CONNECTOR_ROUNDS = 8;

  private agent: HttpAgent;
  private readonly agentUrl: string;
  private readonly threadId: string;
  private profileProvider?: () => PersonalAgentContext;
  private connectorExecutor?: AtomConnectorExecutor;
  private connectorsAvailable: boolean;
  private inFlight = false;
  private queued: string[] = [];
  private disposed = false;
  private textBuffers = new Map<string, string>();
  private pendingConnectorCalls = new Map<string, Promise<void>>();
  private connectorResultsToSend: string[] = [];
  private connectorRounds = 0;

  constructor(config: AgUiAgentConfig) {
    super();
    this.profileProvider = config.profileProvider;
    this.connectorExecutor = config.connectorExecutor;
    this.connectorsAvailable = config.connectorsAvailable ?? Boolean(config.connectorExecutor);
    this.agentUrl = config.url;
    this.threadId = config.threadId ?? uuid();
    this.agent = new HttpAgent({
      url: this.agentUrl,
      threadId: this.threadId,
      headers: config.headers,
    });
  }

  /** Rotate auth headers without resetting the AG-UI thread (session remint). */
  setRequestHeaders(headers: Record<string, string> | undefined): void {
    const messages = this.agent.messages;
    this.agent = new HttpAgent({
      url: this.agentUrl,
      threadId: this.threadId,
      headers,
    });
    this.agent.messages = messages;
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
    this.connectorRounds = 0;
    try {
      while (this.queued.length > 0 && !this.disposed) {
        const batch = this.queued.splice(0, this.queued.length);
        for (const content of batch) {
          this.agent.messages.push({ id: uuid(), role: "user", content });
        }
        await this.runConnectorFollowUps();
      }
    } finally {
      this.inFlight = false;
      if (!this.disposed) this.emit({ type: "done" });
    }
  }

  private async runConnectorFollowUps(): Promise<void> {
    await this.runOnce();
    while (
      this.connectorResultsToSend.length > 0 &&
      this.connectorRounds < AgUiAgentSession.MAX_CONNECTOR_ROUNDS &&
      !this.disposed
    ) {
      this.connectorRounds += 1;
      const batch = this.connectorResultsToSend.splice(0, this.connectorResultsToSend.length);
      for (const content of batch) {
        this.agent.messages.push({ id: uuid(), role: "user", content });
      }
      await this.runOnce();
    }
  }

  private queueConnectorInvoke(req: AtomConnectorInvokeRequest | null): void {
    if (!req || !this.connectorExecutor) return;
    const executor = this.connectorExecutor;
    const promise = (async () => {
      try {
        const resolved = resolveAgUiConnectorInvoke({
          toolName: req.toolName,
          connectorId: req.connectorId,
          operation: req.operation,
          input: req.input,
        });
        if (!resolved.ok) {
          this.connectorResultsToSend.push(
            formatConnectorResultMessage({
              callId: req.callId,
              ok: false,
              error: resolved.error,
            }),
          );
          return;
        }
        const result = await executor({
          connectorId: resolved.call.connectorId as AtomConnectorId,
          operation: resolved.call.operation,
          input: resolved.call.input,
        });
        this.connectorResultsToSend.push(
          formatConnectorResultMessage({ callId: req.callId, ok: true, result }),
        );
      } catch (error) {
        this.connectorResultsToSend.push(
          formatConnectorResultMessage({
            callId: req.callId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    })();
    this.pendingConnectorCalls.set(req.callId, promise);
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
        if (event.name === ATOM_AGUI_EVENTS.CONNECTOR_INVOKE) {
          this.queueConnectorInvoke(parseConnectorInvokeRequest(event.value));
          return;
        }
        const output = mapCustomEventToOutput(event);
        if (output) this.emit(output);
      },
      onRunErrorEvent: ({ event }) => {
        this.emit({
          type: "text",
          text: presentChatAgentError(new Error(event.message ?? "Agent run error")),
        });
      },
    };

    try {
      const profile = this.profileProvider?.();
      const forwardedProps: Record<string, unknown> = {};
      if (profile) forwardedProps[ATOM_AGUI_PROFILE_PROP] = profile;
      if (this.connectorsAvailable) forwardedProps.atomConnectorsAvailable = true;

      await this.agent.runAgent(
        Object.keys(forwardedProps).length > 0 ? { forwardedProps } : {},
        subscriber,
      );
      await Promise.all(this.pendingConnectorCalls.values());
      this.pendingConnectorCalls.clear();
    } catch (error) {
      this.emit({
        type: "text",
        text: presentChatAgentError(error),
      });
    }
  }
}
