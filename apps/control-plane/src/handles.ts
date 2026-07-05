export function normalizeOwnerHandle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("@") ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
}

export function bareOwnerHandle(input: string): string {
  return normalizeOwnerHandle(input).replace(/^@/, "");
}

export function validateOwnerHandle(input: string): string | null {
  const bare = bareOwnerHandle(input);
  if (!bare) return "Choose a handle.";
  if (!/^[a-z0-9][a-z0-9-]{1,22}$/.test(bare)) {
    return "Use 2–24 characters: letters, numbers, or hyphens (shown as @handle).";
  }
  return null;
}

export function parseSignupHandle(body: { email?: string; handle?: string }): {
  handle: string;
  error?: string;
} {
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const requested = body.handle?.trim();
  const handle = requested
    ? bareOwnerHandle(requested)
    : bareOwnerHandle(`@${email.split("@")[0] ?? "user"}`);
  const validationError = validateOwnerHandle(`@${handle}`);
  if (validationError) {
    return { handle, error: validationError };
  }
  return { handle };
}

export function isHandleTaken(
  agents: Iterable<{ handle: string }>,
  handle: string,
): boolean {
  const bare = bareOwnerHandle(handle);
  for (const agent of agents) {
    if (bareOwnerHandle(agent.handle) === bare) return true;
  }
  return false;
}

export function publicHandle(handle: string): string {
  return normalizeOwnerHandle(handle.startsWith("@") ? handle : `@${handle}`);
}
