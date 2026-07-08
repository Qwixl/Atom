import type { CommsAgentClient } from "./client.js";

export interface RssItemSummary {
  id: string;
  title: string;
  link?: string;
  published?: string;
  feedId: string;
}

function formatItemLine(item: RssItemSummary): string {
  const date = item.published ? ` (${item.published})` : "";
  return `- ${item.title}${date}`;
}

export async function isRssConnected(client: CommsAgentClient): Promise<boolean> {
  try {
    const status = await client.invokeConnector("rss", "getStatus", {});
    return Boolean((status.result as { connected?: boolean }).connected);
  } catch {
    return false;
  }
}

export async function loadRssItems(
  client: CommsAgentClient,
  limit = 20,
  opts?: { throwOnError?: boolean },
): Promise<{ items: RssItemSummary[]; feedLabels: string[] }> {
  try {
    const status = await client.invokeConnector("rss", "getStatus", {});
    const result = status.result as {
      connected?: boolean;
      feeds?: Array<{ id: string; label: string }>;
    };
    if (!result.connected) return { items: [], feedLabels: [] };
    const feedLabels = (result.feeds ?? []).map((feed) => feed.label);
    const listed = await client.invokeConnector("rss", "listItems", { limit });
    const items = (listed.result as { items?: RssItemSummary[] }).items ?? [];
    return {
      items: items.filter((item) => typeof item.title === "string"),
      feedLabels,
    };
  } catch (error) {
    if (opts?.throwOnError) throw error;
    return { items: [], feedLabels: [] };
  }
}

/** Agent-readable RSS snapshot for the system prompt. */
export function formatRssContextForPrompt(opts: {
  connected: boolean;
  items: RssItemSummary[];
  feedLabels?: string[];
  error?: string;
}): string {
  if (opts.error) {
    return `RSS read failed: ${opts.error}. Owner can check Settings → Connectors.`;
  }
  if (!opts.connected) {
    return "Not connected. Owner can add a public RSS/Atom feed URL in Settings → Connectors.";
  }
  const labels = opts.feedLabels?.length ? `Owner feeds: ${opts.feedLabels.join(", ")}` : "Owner feeds configured.";
  const lines = opts.items.slice(0, 25).map(formatItemLine);
  return [
    `Optional owner RSS snapshot (not a restriction on what you can discuss). ${labels}`,
    lines.length > 0
      ? `Recent items:\n${lines.join("\n")}`
      : "Recent items: none returned from feeds.",
    lines.length > 0
      ? "Use for feed-specific questions only; general news uses your own capabilities."
      : "If the owner asks for feed headlines and none returned, suggest checking feed URLs in Settings.",
  ].join("\n\n");
}
