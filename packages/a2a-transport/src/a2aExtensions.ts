/**
 * A2A extension HTTP binding helpers (D130 / ST-02b).
 *
 * The `A2A-Extensions` header is process/telemetry plumbing for Atom→Atom
 * traffic. It is **not** a Governed Object security control: missing the header
 * MUST NOT weaken media-type-authoritative verify. Refusing for a missing
 * required extension applies only when a card marks some extension
 * `required: true` (fixtures / future extensions — GO itself stays optional).
 */

import type { AgentCard, AgentExtension } from "@a2a-js/sdk";
import { ATOM_A2A_EXTENSION } from "./constants.js";

/** Canonical HTTP header name (A2A v1; formerly `X-A2A-Extensions`). */
export const A2A_EXTENSIONS_HEADER = "A2A-Extensions";

/** Comma-separated extension URI list for the request header. */
export function formatA2aExtensionsHeader(uris: string[]): string {
  return uris.map((u) => u.trim()).filter(Boolean).join(", ");
}

/** Parse `A2A-Extensions` (or legacy `X-A2A-Extensions`) into URI strings. */
export function parseA2aExtensionsHeader(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

export function cardExtensions(card: AgentCard): AgentExtension[] {
  return card.capabilities?.extensions ?? [];
}

/**
 * Extensions marked required on the card that are absent from the client's
 * declared URI set. Empty when the client satisfies all required declarations.
 */
export function missingRequiredExtensions(
  card: AgentCard,
  declaredUris: readonly string[],
): string[] {
  const declared = new Set(declaredUris);
  const missing: string[] = [];
  for (const ext of cardExtensions(card)) {
    if (!ext.required) continue;
    if (!declared.has(ext.uri)) missing.push(ext.uri);
  }
  return missing;
}

/** Default URIs Atom peer clients SHOULD advertise on `A2A-Extensions`. */
export function defaultAtomA2aExtensionUris(): string[] {
  return [ATOM_A2A_EXTENSION];
}

export class ExtensionSupportRequiredError extends Error {
  readonly missingExtensionUris: string[];

  constructor(missingExtensionUris: string[]) {
    super(
      `Required A2A extension(s) not declared: ${missingExtensionUris.join(", ")}`,
    );
    this.name = "ExtensionSupportRequiredError";
    this.missingExtensionUris = missingExtensionUris;
  }
}

/**
 * Refuse when the card marks extensions `required: true` that the client did
 * not declare. GO stays `required: false` on Atom cards (D130); this path is
 * for fixtures and future required extensions.
 */
export function assertRequiredExtensionsSupported(
  card: AgentCard,
  declaredUris: readonly string[],
): void {
  const missing = missingRequiredExtensions(card, declaredUris);
  if (missing.length > 0) {
    throw new ExtensionSupportRequiredError(missing);
  }
}
