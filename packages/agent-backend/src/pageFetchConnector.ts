import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import { fetchTextLimited, stripHtmlToText, validateConnectorHttpsUrl } from "./connectorUrl.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

/** Ephemeral HTTPS page read for [link-intent] summarize/full (no vault). */
export const PAGE_FETCH_CONNECTOR_ID = "page-fetch";

const PAGE_TEXT_MAX_CHARS = 12_000;
const PAGE_FETCH_MAX_BYTES = 128_000;

export const PAGE_FETCH_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "readPage",
    permission: "read",
    description:
      "Fetch a public https URL and return plain-text excerpt for summarize/full link intents.",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function pageFetchConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return PAGE_FETCH_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

export async function invokePageFetchConnector(
  _ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = pageFetchConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "readPage": {
      const rawUrl = String(input.url ?? "").trim();
      if (!rawUrl) {
        throw new Error("url required");
      }
      const url = validateConnectorHttpsUrl(rawUrl);
      if (!url.startsWith("https://") && !url.startsWith("http://")) {
        throw new Error("url must be http(s)");
      }
      // Prefer https for public article reads when the caller passed http.
      const fetchUrl = url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
      const html = await fetchTextLimited(fetchUrl, PAGE_FETCH_MAX_BYTES);
      const text = stripHtmlToText(html).slice(0, PAGE_TEXT_MAX_CHARS);
      if (!text.trim()) {
        throw new Error("Page returned no readable text");
      }
      return {
        operation: operationId,
        result: {
          url: fetchUrl,
          text,
          truncated: stripHtmlToText(html).length > PAGE_TEXT_MAX_CHARS,
          source: "page-fetch",
        },
      };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
