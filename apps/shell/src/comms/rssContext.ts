import { validateHttpsUrl } from "@qwixl/shell-core";
import type { CommsAgentClient } from "./client.js";

export interface RssItemSummary {
  id: string;
  title: string;
  link?: string;
  published?: string;
  feedId: string;
  excerpt?: string;
}

function formatItemLine(item: RssItemSummary): string {
  const date = item.published ? ` (${item.published})` : "";
  const link = item.link?.trim();
  const safeLink = link ? validateHttpsUrl(link) : null;
  const headline = safeLink
    ? `- [${item.title}](${safeLink})${date}`
    : `- ${item.title}${date}`;
  const excerpt = item.excerpt?.trim();
  if (!excerpt) return headline;
  return `${headline}\n  Excerpt: ${excerpt}`;
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
      ? `Recent items (title, optional excerpt, link):\n${lines.join("\n")}\n\nWhen showing a feed as the main surface, prefer \`core/card\` + \`core/disclosure\` per story (summary = headline; children = excerpt). In daily briefings include up to 5 linked headlines from this list under a feed-oriented card — separate from briefing topic news.`
      : "Recent items: none returned from feeds.",
  ].join("\n\n");
}
