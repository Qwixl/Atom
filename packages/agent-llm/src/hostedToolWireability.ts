/** Hosted tools that need extra request config — discover but do not auto-wire. */
export const HOSTED_TOOLS_REQUIRING_CONFIG = new Set([
  "file_search",
  "mcp",
  "computer_use",
  "computer-preview",
]);

/** Tools that work with `{ type }` alone on the Responses API. */
export const SELF_WIRING_HOSTED_TOOLS = new Set([
  "web_search",
  "web_search_preview",
  "code_interpreter",
  "image_generation",
  "tool_search",
]);

export function isWireableHostedToolType(toolType: string): boolean {
  const id = toolType.trim();
  if (!id) return false;
  if (HOSTED_TOOLS_REQUIRING_CONFIG.has(id)) return false;
  if (SELF_WIRING_HOSTED_TOOLS.has(id)) return true;
  if (/^[a-z][a-z0-9_]*$/i.test(id) && !id.endsWith("_effort") && !id.startsWith("reasoning_")) {
    return true;
  }
  return false;
}

export function filterWireableHostedTools(toolTypes: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of toolTypes) {
    const id = raw === "web_search_preview" ? "web_search" : raw.trim();
    if (!id || seen.has(id) || !isWireableHostedToolType(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
