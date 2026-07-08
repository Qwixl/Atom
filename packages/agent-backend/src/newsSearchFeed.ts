import { fetchTextLimited } from "./connectorUrl.js";
import { parseRssOrAtomFeed, type RssItemSummary } from "./rssFeed.js";

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

export function buildGoogleNewsSearchUrl(query: string): string {
  const trimmed = query.trim() || "top news";
  const params = new URLSearchParams({
    q: trimmed,
    hl: "en-GB",
    gl: "GB",
    ceid: "GB:en",
  });
  return `${GOOGLE_NEWS_RSS}?${params.toString()}`;
}

export async function fetchGoogleNewsItems(query: string, limit = 10): Promise<RssItemSummary[]> {
  const capped = Math.min(Math.max(limit, 1), 25);
  const url = buildGoogleNewsSearchUrl(query);
  const xml = await fetchTextLimited(url);
  const items = parseRssOrAtomFeed(xml, "web-news");
  return items.slice(0, capped).map((item, index) => ({
    ...item,
    id: `web-news-${index}`,
    feedId: "web-news",
  }));
}
