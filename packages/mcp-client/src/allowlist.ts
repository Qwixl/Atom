/** Returns true when toolName is permitted by the server allowlist (empty = all tools). */
export function isMcpToolAllowed(toolName: string, allowedTools: readonly string[]): boolean {
  const name = toolName.trim();
  if (!name) return false;
  if (allowedTools.length === 0) return true;
  return allowedTools.includes(name);
}
