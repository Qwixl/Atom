import { fetchTextLimited, validateConnectorHttpsUrl } from "./connectorUrl.js";

export interface RssItemSummary {
  id: string;
  title: string;
  link?: string;
  published?: string;
  feedId: string;
  enclosureUrl?: string;
  enclosureType?: string;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function firstTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  if (!match?.[1]) return undefined;
  const inner = match[1].trim();
  if (inner.startsWith("<![CDATA[")) {
    return inner.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  }
  return decodeXmlEntities(inner.replace(/<[^>]+>/g, "").trim());
}

function linkHref(block: string): string | undefined {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (atom?.[1]) return atom[1].trim();
  return firstTag(block, "link");
}

function enclosureFromBlock(block: string): { url?: string; type?: string } {
  const tagMatch = block.match(/<enclosure\b([^>]*)\/?>/i);
  if (tagMatch?.[1]) {
    const attrs = tagMatch[1];
    const url = attrs.match(/\burl=["']([^"']+)["']/i)?.[1]?.trim();
    const type = attrs.match(/\btype=["']([^"']+)["']/i)?.[1]?.trim();
    if (url) return { url, type };
  }
  const atomEnclosure = block.match(
    /<link[^>]+rel=["']enclosure["'][^>]+href=["']([^"']+)["'][^>]*(?:type=["']([^"']+)["'])?/i,
  );
  if (atomEnclosure?.[1]) {
    return { url: atomEnclosure[1].trim(), type: atomEnclosure[2]?.trim() };
  }
  return {};
}

export function parseRssOrAtomFeed(xml: string, feedId: string): RssItemSummary[] {
  const items: RssItemSummary[] = [];
  const isAtom = /<feed[\s>]/i.test(xml);
  const blockTag = isAtom ? "entry" : "item";
  const re = new RegExp(`<${blockTag}[\\s\\S]*?<\\/${blockTag}>`, "gi");
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = re.exec(xml)) !== null) {
    const block = match[0];
    const title = firstTag(block, "title");
    if (!title) continue;
    const published =
      firstTag(block, "published") ??
      firstTag(block, "updated") ??
      firstTag(block, "pubDate");
    const enclosure = enclosureFromBlock(block);
    items.push({
      id: `${feedId}-${index}`,
      title,
      link: linkHref(block),
      published,
      feedId,
      enclosureUrl: enclosure.url,
      enclosureType: enclosure.type,
    });
    index += 1;
  }
  return items;
}

export async function fetchRssItems(
  feeds: Array<{ id: string; url: string }>,
  limit = 20,
): Promise<RssItemSummary[]> {
  const capped = Math.min(Math.max(limit, 1), 50);
  const chunks = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const xml = await fetchTextLimited(validateConnectorHttpsUrl(feed.url));
        return parseRssOrAtomFeed(xml, feed.id);
      } catch {
        return [] as RssItemSummary[];
      }
    }),
  );
  const all = chunks.flat();
  all.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  return all.slice(0, capped);
}
