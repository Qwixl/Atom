/**
 * Internal composition model.
 *
 * Deliberately one abstraction above any wire format (A2UI etc.) per D008 —
 * transport adapters translate into this model at the boundary.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/** A single node in a composition tree. */
export interface CompositionNode {
  /** Unique within the surface; used for event routing and attestation. */
  id: string;
  /** Catalog component reference, e.g. "core/text" or "finance/portfolio-chart@2". */
  component: string;
  /**
   * Abstract type used for fallback substitution when the component is
   * unavailable, e.g. "chart/time-series". See docs: semantic role.
   */
  semanticRole?: string;
  props?: JsonObject;
  children?: CompositionNode[];
  /** Event names the composing agent wants routed back to it. */
  events?: string[];
}

/** A full surface description sent by the owner's agent. */
export interface Composition {
  version: 1;
  surfaceId: string;
  /** Human-readable purpose, restated by shell chrome at decision points. */
  intent?: string;
  root: CompositionNode;
}

/** An interaction event flowing back from the shell to the agent. */
export interface UiEvent {
  surfaceId: string;
  nodeId: string;
  name: string;
  payload?: JsonValue;
  timestamp: number;
}

/**
 * A request for an action of consequence. Never rendered by modules or
 * composition nodes — routed exclusively to shell-owned chrome (D010).
 */
export interface ConsequentialAction {
  id: string;
  kind: "confirmation" | "payment" | "permission";
  title: string;
  /**
   * Terms restated from the underlying data object, NOT from any module's
   * rendering. This is what the chrome displays and what gets attested.
   */
  terms: JsonObject;
  confirmLabel?: string;
  declineLabel?: string;
}
