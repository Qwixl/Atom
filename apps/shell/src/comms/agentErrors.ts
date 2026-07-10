import type { AtomAccountType } from "../auth/hostedAccount.js";
import { presentChatAgentError } from "@qwixl/shell-core";

export type PresentUserErrorOptions = {
  /** Developer accounts may see technical detail appended. */
  accountType?: AtomAccountType;
  /** Force technical detail (e.g. local SHOW_DEV_WORKFLOWS). */
  showTechnicalDetail?: boolean;
};

function rawMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mapFriendly(error: unknown): string {
  const message = rawMessage(error);
  const lower = message.toLowerCase();

  if (/could not locate a running agent/i.test(message)) {
    return "The Coffee Shop host is not running yet. Try again in a few minutes.";
  }
  if (/no data/i.test(message)) {
    return "Passkey approval failed (vault key encoding). Re-register your passkey in Settings → Security, then try again.";
  }
  if (/connection token was rejected|connection token/.test(lower) && /settings → agent/i.test(message)) {
    return message;
  }
  if (/could not reach your agent/i.test(message) && /settings|url|running/i.test(lower)) {
    return message;
  }
  // Prefer shared chat mapper for common agent/HTTP patterns.
  const chat = presentChatAgentError(error);
  if (chat !== "Something went wrong talking to your agent. Try again.") {
    return chat;
  }
  // Already-friendly shell copy (≤160, no stack/JSON) — keep as-is.
  if (
    message.length <= 160 &&
    !/[{}\[\]\\]|at\s+\S+\s+\(|Error:|ECONN|ENOTFOUND|stack|typescript|undefined is not/i.test(message)
  ) {
    return message;
  }
  return "Something went wrong. Try again.";
}

/**
 * Present an error for end users. Default is always non-technical.
 * Developer accounts (or showTechnicalDetail) get friendly copy plus raw detail.
 */
export function presentUserError(error: unknown, options: PresentUserErrorOptions = {}): string {
  const friendly = mapFriendly(error);
  const raw = rawMessage(error);
  const showRaw =
    options.showTechnicalDetail === true || options.accountType === "developer";
  if (showRaw && raw && raw !== friendly) {
    return `${friendly}\n\nTechnical details: ${raw}`;
  }
  return friendly;
}

/** Map agent API errors to short, user-facing messages (always sanitized). */
export function formatAgentError(error: unknown): string {
  return presentUserError(error);
}

/** Short message when Coffee Shop / discover host resolution fails. */
export function formatDiscoverHostError(error: unknown): string {
  return presentUserError(error);
}

export function isAgentAuthError(error: unknown): boolean {
  const message = rawMessage(error);
  return /unauthorized|401/i.test(message);
}
