import type { Composition, ConsequentialAction, JsonValue, UiEvent } from "./types.js";

/**
 * A request from the agent to access guarded owner data. The shell renders
 * it in owner chrome (permission kind), attests the decision, and only then
 * discloses the records — the agent never reads the store directly.
 */
export interface DataRequest {
  requestId: string;
  /** Guarded categories the agent wants disclosed, e.g. ["travel-history"]. */
  categories: string[];
  /** Why the agent needs it, restated to the owner in chrome. */
  reason: string;
}

/**
 * What the shell receives from the owner's agent. Transport adapters
 * (AG-UI etc.) translate wire events into this stream.
 */
export type AgentOutput =
  | { type: "text"; text: string }
  | { type: "composition"; composition: Composition }
  | { type: "consequential-action"; surfaceId: string; action: ConsequentialAction }
  | { type: "data-request"; request: DataRequest }
  | { type: "done" };

export type AgentOutputListener = (output: AgentOutput) => void;

/**
 * The agent ↔ shell contract. The shell is agent-agnostic: anything that
 * implements this (mock, AG-UI adapter, direct LLM) can drive it.
 */
export interface AgentSession {
  /** Free-text user input (the conversational channel). */
  sendUserMessage(text: string): void;
  /** Interaction events from rendered surfaces. */
  sendUiEvent(event: UiEvent): void;
  /** Outcome of a shell-chrome decision (never routed through modules). */
  sendActionDecision(actionId: string, decision: "approved" | "declined"): void;
  /**
   * Outcome of a data request: approved requests carry the disclosed
   * records (shell-assembled, post-attestation); declined carry none.
   */
  sendDataDisclosure?(
    requestId: string,
    decision: "approved" | "declined",
    records: Array<{ category: string; label: string; value: JsonValue }>,
  ): void;
  subscribe(listener: AgentOutputListener): () => void;
}

/** Small emitter base for session implementations. */
export class SessionEmitter {
  private listeners = new Set<AgentOutputListener>();

  subscribe(listener: AgentOutputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(output: AgentOutput): void {
    for (const listener of this.listeners) listener(output);
  }
}
