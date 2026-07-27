/**
 * List-composition repair (composition-loop fix for "intro only" replies).
 * Connector tools that return list-shaped data (news, RSS, calendar, …) are
 * instructed to render results only via a `composition` (`core/list`) — never
 * inline in `text`. Nothing previously enforced that a composition was
 * actually produced, so a turn could stop at an intro sentence ("Here are the
 * latest headlines:") with no list attached. When a list-shaped tool returned
 * real items this turn but the final protocol has no composition, inject one
 * correction turn before emitting to the shell (same pattern as
 * softConfirmRepair.ts).
 */
export const LIST_COMPOSITION_REPAIR_TAG = "[list-composition-repair]";

/** Matches intent-named list/search connector tools (rss_list_items, news_search, calendar_list_events, …). */
export function isListShapedToolName(name: string): boolean {
  return /_list(_|$)|_search$/.test(name);
}

/** True when a connector tool result carries at least one non-empty array (its "items"). */
export function resultHasNonEmptyItems(result: unknown, depth = 0): boolean {
  if (depth > 3 || result == null || typeof result !== "object") return false;
  if (Array.isArray(result)) return result.length > 0;
  for (const value of Object.values(result as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value.length > 0) return true;
      continue;
    }
    if (value && typeof value === "object" && resultHasNonEmptyItems(value, depth + 1)) {
      return true;
    }
  }
  return false;
}

export function protocolMessagesHaveComposition(messages: unknown[]): boolean {
  return /"type"\s*:\s*"composition"/.test(JSON.stringify(messages));
}

/** One-shot correction injected into the LLM history (not shown as owner chat). */
export function listCompositionRepairUserContent(toolName: string): string {
  return (
    `${LIST_COMPOSITION_REPAIR_TAG} Your previous reply called ${toolName}, which returned real ` +
    `results, but your reply had no matching composition — an intro sentence with no rendered list ` +
    `is an invalid turn. Respond again for that same turn with ONLY the JSON object: include a short ` +
    `spoken-style text intro AND a "composition" message rendering the fetched items via core/list ` +
    `(inside core/card). Use the items the tool already returned — do not invent different ones and ` +
    `do not call the tool again.`
  );
}
