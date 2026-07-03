import { normalizeDataRequest } from "./dataRequest.js";
import type { AgentOutput } from "./session.js";
import { validateComposition, validateConsequentialAction } from "./validate.js";

export type AgentWireReject = { kind: "reject"; text: string };

export type AgentWireResult = { kind: "output"; output: AgentOutput } | AgentWireReject;

function invalidSurface(errors: string[]): AgentWireReject {
  return {
    kind: "reject",
    text: `(The agent produced an invalid surface, discarded by the shell: ${errors.join("; ")})`,
  };
}

function invalidAction(errors: string[]): AgentWireReject {
  return {
    kind: "reject",
    text: `(The agent requested a malformed consequential action, blocked by the shell: ${errors.join("; ")})`,
  };
}

function invalidDataRequest(missing: string[]): AgentWireReject {
  return {
    kind: "reject",
    text: `(The agent made a malformed data request, blocked by the shell: missing ${missing.join(", ")}. Use: { "type": "data-request", "request": { "requestId": "unique-id", "categories": ["identity"], "reason": "one sentence" } })`,
  };
}

/** Validate a composition payload (LLM nested or AG-UI direct value). */
export function parseCompositionValue(value: unknown): AgentWireResult {
  const result = validateComposition(value);
  return result.ok
    ? { kind: "output", output: { type: "composition", composition: result.value } }
    : invalidSurface(result.errors);
}

/** Parse LLM/JSON protocol message objects ({ type, ... }). */
export function parseAgentProtocolMessage(message: unknown): AgentWireResult | null {
  if (typeof message !== "object" || message === null) return null;
  const m = message as Record<string, unknown>;

  if (m.type === "text" && typeof m.text === "string") {
    return { kind: "output", output: { type: "text", text: m.text } };
  }

  if (m.type === "composition") {
    return parseCompositionValue(m.composition);
  }

  if (m.type === "consequential-action") {
    const result = validateConsequentialAction(m.action);
    if (result.ok && typeof m.surfaceId === "string") {
      return {
        kind: "output",
        output: {
          type: "consequential-action",
          surfaceId: m.surfaceId,
          action: result.value,
        },
      };
    }
    const errors = result.ok ? ["surfaceId: required string"] : result.errors;
    return invalidAction(errors);
  }

  if (m.type === "data-request") {
    const result = normalizeDataRequest(m);
    return result.ok
      ? { kind: "output", output: { type: "data-request", request: result.value } }
      : invalidDataRequest(result.missing);
  }

  return null;
}

/** Parse AG-UI atom.consequential-action CUSTOM payload. */
export function parseConsequentialPayload(payload: unknown): AgentWireResult {
  const body =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const result = validateConsequentialAction(body?.action);
  if (result.ok && typeof body?.surfaceId === "string") {
    return {
      kind: "output",
      output: {
        type: "consequential-action",
        surfaceId: body.surfaceId,
        action: result.value,
      },
    };
  }
  const errors = result.ok ? ["surfaceId: required string"] : result.errors;
  return invalidAction(errors);
}

/** Parse AG-UI atom.data-request CUSTOM payload (bare request object). */
export function parseDataRequestPayload(payload: unknown): AgentWireResult {
  const envelope =
    payload && typeof payload === "object"
      ? ({ type: "data-request", request: payload } as Record<string, unknown>)
      : ({ type: "data-request" } as Record<string, unknown>);
  const result = normalizeDataRequest(envelope);
  return result.ok
    ? { kind: "output", output: { type: "data-request", request: result.value } }
    : invalidDataRequest(result.missing);
}
