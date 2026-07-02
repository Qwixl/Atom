import type { Composition, ConsequentialAction, UiEvent } from "./types.js";

/**
 * What the shell receives from the owner's agent. Transport adapters
 * (AG-UI etc.) translate wire events into this stream.
 */
export type AgentOutput =
  | { type: "text"; text: string }
  | { type: "composition"; composition: Composition }
  | { type: "consequential-action"; surfaceId: string; action: ConsequentialAction }
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
