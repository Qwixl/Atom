/**
 * Untrusted-content quarantine (D031, spotlighting pattern): counterpart-
 * originated free text is delimited before entering a model prompt so the
 * model treats it as data, never instructions.
 */

export const UNTRUSTED_CONTENT_OPEN = "<<<UNTRUSTED-COUNTERPART-CONTENT>>>";
export const UNTRUSTED_CONTENT_CLOSE = "<<<END-UNTRUSTED-COUNTERPART-CONTENT>>>";

/** Marker-lookalike sequences are stripped so quoted content cannot escape the quarantine block. */
const MARKER_ESCAPE_PATTERN = /<{2,}\/?\s*(END-)?UNTRUSTED[^>]*>{2,}/gi;

export function sanitizeUntrustedContent(text: string): string {
  return text.replace(MARKER_ESCAPE_PATTERN, "[removed-marker]");
}

export interface UntrustedContentOptions {
  /** Origin label shown to the model, e.g. a contact name or DID. */
  source?: string;
  /** Verified data-object purpose, when the content came from a signed object. */
  purpose?: string;
}

/**
 * Wrap counterpart free text for prompt inclusion. The system prompt
 * (buildSystemPrompt) carries the standing rule for these markers.
 */
export function wrapUntrustedContent(text: string, options: UntrustedContentOptions = {}): string {
  const header = [
    options.source ? `source: ${sanitizeUntrustedContent(options.source)}` : null,
    options.purpose ? `purpose: ${sanitizeUntrustedContent(options.purpose)}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  return [
    UNTRUSTED_CONTENT_OPEN,
    ...(header ? [header] : []),
    sanitizeUntrustedContent(text),
    UNTRUSTED_CONTENT_CLOSE,
  ].join("\n");
}

const INSTRUCTION_PATTERNS: RegExp[] = [
  /ignore (all |any |your )?(previous|prior|earlier|above) (instructions|rules|prompts)/i,
  /disregard (the |your )?(system|previous|prior) (prompt|instructions|rules)/i,
  /you (are|must) now (act|behave|respond) as/i,
  /do not (tell|inform|mention (this )?to) the (user|owner)/i,
  /reveal (the |your )?(system prompt|instructions|hidden|guarded|secret)/i,
  /\b(include|send|share|disclose)\b.{0,40}\b(passport|password|api key|credit card|token|credentials)\b/i,
];

/**
 * Heuristic pre-screen for instruction-like content in counterpart text.
 * Not a defense on its own (the prompt rule is); used to surface a notice
 * in shell UI per D031 flag-and-surface.
 */
export function detectInstructionLikeContent(text: string): boolean {
  return INSTRUCTION_PATTERNS.some((pattern) => pattern.test(text));
}
