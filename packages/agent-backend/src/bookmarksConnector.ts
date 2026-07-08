import type { ConnectorVault } from "./connectorVault.js";
import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchTextLimited, stripHtmlToText, validateConnectorHttpsUrl } from "./connectorUrl.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const BOOKMARKS_CONNECTOR_ID = "bookmarks";

export const BOOKMARKS_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Return saved bookmark labels (not URLs).",
    cacheTtlMs: 0,
  },
  {
    id: "listBookmarks",
    permission: "read",
    description: "List saved bookmarks.",
    cacheTtlMs: 0,
  },
  {
    id: "readBookmark",
    permission: "read",
    description: "Fetch and extract plain text from a saved bookmark URL.",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function bookmarksConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return BOOKMARKS_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

export async function invokeBookmarksConnector(
  ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = bookmarksConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }
  const bookmarks = ctx.vault.getBookmarks();

  switch (operationId) {
    case "getStatus":
      return {
        operation: operationId,
        result: {
          connected: bookmarks.length > 0,
          bookmarkCount: bookmarks.length,
          bookmarks: bookmarks.map((item) => ({ id: item.id, label: item.label })),
          provider: "bookmarks",
        },
      };
    case "listBookmarks":
      return {
        operation: operationId,
        result: {
          bookmarks: bookmarks.map((item) => ({
            id: item.id,
            label: item.label,
            addedAt: item.addedAt,
          })),
        },
      };
    case "readBookmark": {
      const bookmarkId = String(input.bookmarkId ?? "").trim();
      if (!bookmarkId) {
        throw new Error("bookmarkId required");
      }
      const bookmark = bookmarks.find((item) => item.id === bookmarkId);
      if (!bookmark) {
        throw new Error(`Unknown bookmark id "${bookmarkId}"`);
      }
      const html = await fetchTextLimited(bookmark.url, 128_000);
      const text = stripHtmlToText(html).slice(0, 12_000);
      return {
        operation: operationId,
        result: {
          bookmarkId,
          label: bookmark.label,
          excerpt: text,
          length: text.length,
        },
      };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}

export async function addBookmarkToVault(
  vault: ConnectorVault,
  rawUrl: string,
  label?: string,
): Promise<{ id: string; label: string }> {
  validateConnectorHttpsUrl(rawUrl);
  const item = await vault.addBookmark({
    label: label?.trim() || "Bookmark",
    url: rawUrl.trim(),
  });
  return { id: item.id, label: item.label };
}

export async function removeBookmarkFromVault(
  vault: ConnectorVault,
  bookmarkId: string,
): Promise<boolean> {
  return vault.removeBookmark(bookmarkId.trim());
}
