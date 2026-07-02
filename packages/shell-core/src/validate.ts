import type { Composition, CompositionNode, ConsequentialAction, JsonObject } from "./types.js";

/**
 * Structural validation for agent-supplied payloads. The shell never trusts
 * that an agent (especially an LLM) produced a well-formed composition.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateNode(
  value: unknown,
  path: string,
  errors: string[],
  seenIds: Set<string>,
): value is CompositionNode {
  if (!isPlainObject(value)) {
    errors.push(`${path}: node must be an object`);
    return false;
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    errors.push(`${path}.id: required non-empty string`);
  } else if (seenIds.has(value.id)) {
    errors.push(`${path}.id: duplicate id "${value.id}"`);
  } else {
    seenIds.add(value.id);
  }
  if (typeof value.component !== "string" || value.component.length === 0) {
    errors.push(`${path}.component: required non-empty string`);
  }
  if (value.semanticRole !== undefined && typeof value.semanticRole !== "string") {
    errors.push(`${path}.semanticRole: must be a string`);
  }
  if (value.props !== undefined && !isPlainObject(value.props)) {
    errors.push(`${path}.props: must be an object`);
  }
  if (value.events !== undefined) {
    if (!Array.isArray(value.events) || value.events.some((e) => typeof e !== "string")) {
      errors.push(`${path}.events: must be an array of strings`);
    }
  }
  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) {
      errors.push(`${path}.children: must be an array`);
    } else {
      value.children.forEach((child, index) =>
        validateNode(child, `${path}.children[${index}]`, errors, seenIds),
      );
    }
  }
  return errors.length === 0;
}

export function validateComposition(value: unknown): ValidationResult<Composition> {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["composition must be an object"] };
  }
  if (value.version !== 1) errors.push("version: must be 1");
  if (typeof value.surfaceId !== "string" || value.surfaceId.length === 0) {
    errors.push("surfaceId: required non-empty string");
  }
  if (value.intent !== undefined && typeof value.intent !== "string") {
    errors.push("intent: must be a string");
  }
  if (value.root === undefined) {
    errors.push("root: required");
  } else {
    validateNode(value.root, "root", errors, new Set());
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: value as unknown as Composition };
}

const ACTION_KINDS = new Set(["confirmation", "payment", "permission"]);

export function validateConsequentialAction(
  value: unknown,
): ValidationResult<ConsequentialAction> {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["action must be an object"] };
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    errors.push("id: required non-empty string");
  }
  if (typeof value.kind !== "string" || !ACTION_KINDS.has(value.kind)) {
    errors.push(`kind: must be one of ${[...ACTION_KINDS].join(", ")}`);
  }
  if (typeof value.title !== "string" || value.title.length === 0) {
    errors.push("title: required non-empty string");
  }
  if (!isPlainObject(value.terms)) {
    errors.push("terms: required object restating the terms being agreed to");
  }
  if (value.confirmLabel !== undefined && typeof value.confirmLabel !== "string") {
    errors.push("confirmLabel: must be a string");
  }
  if (value.declineLabel !== undefined && typeof value.declineLabel !== "string") {
    errors.push("declineLabel: must be a string");
  }
  if (errors.length > 0) return { ok: false, errors };
  const action = value as unknown as ConsequentialAction & { terms: JsonObject };
  return { ok: true, value: action };
}
