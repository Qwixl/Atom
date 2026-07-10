/** Map agent API errors to short, user-facing messages. */
export function formatAgentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (/unauthorized|401/.test(lower)) {
    return "Connection token was rejected. Open Settings → Agent connection and enter your token again.";
  }
  if (/failed to fetch|networkerror|load failed/.test(lower)) {
    return "Could not reach your agent. Check that it is running and the URL is correct.";
  }
  if (/could not reach your agent/.test(lower)) {
    return message;
  }
  if (/connection token/.test(lower)) {
    return message;
  }
  if (/502|503|504/.test(lower)) {
    return "Your agent is not responding right now. Try again in a moment.";
  }
  if (/no data/i.test(message)) {
    return "Passkey approval failed (vault key encoding). Re-register your passkey in Settings → Security, then try again.";
  }
  if (message.startsWith("Request failed (")) {
    return "Could not reach your agent. Check your connection settings.";
  }
  return message.length > 160 ? "Something went wrong talking to your agent." : message;
}

/** Short message when Coffee Shop / discover host resolution fails. */
export function formatDiscoverHostError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/could not locate a running agent/i.test(message)) {
    return "The Coffee Shop host is not running yet. Try again in a few minutes.";
  }
  return formatAgentError(error);
}

export function isAgentAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unauthorized|401/i.test(message);
}
