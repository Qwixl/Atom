import type { DataRequest } from "./session.js";

function readCategories(source: Record<string, unknown>): string[] {
  if (Array.isArray(source.categories)) {
    return source.categories
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim().toLowerCase());
  }
  if (typeof source.category === "string" && source.category.trim()) {
    return [source.category.trim().toLowerCase()];
  }
  if (typeof source.categories === "string" && source.categories.trim()) {
    return [source.categories.trim().toLowerCase()];
  }
  return [];
}

/**
 * Tolerant parse for agent-emitted data-request messages. Accepts nested
 * `request` object or flat fields; `id` alias for `requestId`; singular
 * `category`. Generates requestId when categories + reason are present.
 */
export function normalizeDataRequest(
  message: Record<string, unknown>,
): { ok: true; value: DataRequest } | { ok: false; missing: string[] } {
  const nested =
    message.request && typeof message.request === "object" && message.request !== null
      ? (message.request as Record<string, unknown>)
      : message;

  let requestId =
    (typeof nested.requestId === "string" ? nested.requestId.trim() : "") ||
    (typeof nested.id === "string" ? nested.id.trim() : "") ||
    (typeof message.requestId === "string" ? message.requestId.trim() : "");

  const categoriesNested = readCategories(nested);
  const categories = categoriesNested.length > 0 ? categoriesNested : readCategories(message);
  const reason =
    (typeof nested.reason === "string" ? nested.reason.trim() : "") ||
    (typeof message.reason === "string" ? message.reason.trim() : "");

  if (!requestId && categories.length > 0 && reason) {
    requestId = `req-${Date.now()}`;
  }

  const missing: string[] = [];
  if (!requestId) missing.push("requestId");
  if (categories.length === 0) missing.push("categories");
  if (!reason) missing.push("reason");

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return { ok: true, value: { requestId, categories, reason } };
}
