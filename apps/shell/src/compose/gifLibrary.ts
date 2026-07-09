/** Curated GIF pack — no API key required. Optional Giphy search when VITE_GIPHY_API_KEY is set. */
export type GifItem = {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
  width?: number;
  height?: number;
};

/** Public Giphy media URLs for common reactions (stable CDN paths). */
export const CURATED_GIFS: GifItem[] = [
  {
    id: "thumbs-up",
    title: "Thumbs up",
    previewUrl: "https://media.giphy.com/media/111ebonMs90YLu/200.gif",
    url: "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif",
  },
  {
    id: "clap",
    title: "Clapping",
    previewUrl: "https://media.giphy.com/media/7rj2ZgEhDZsTMKazMc/200.gif",
    url: "https://media.giphy.com/media/7rj2ZgEhDZsTMKazMc/giphy.gif",
  },
  {
    id: "laugh",
    title: "Laughing",
    previewUrl: "https://media.giphy.com/media/10JhviFuU2gWDK/200.gif",
    url: "https://media.giphy.com/media/10JhviFuU2gWDK/giphy.gif",
  },
  {
    id: "mind-blown",
    title: "Mind blown",
    previewUrl: "https://media.giphy.com/media/26u4cqiYI30juCOGY/200.gif",
    url: "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif",
  },
  {
    id: "wave",
    title: "Wave",
    previewUrl: "https://media.giphy.com/media/xdM4x6YXj15l6/200.gif",
    url: "https://media.giphy.com/media/xdM4x6YXj15l6/giphy.gif",
  },
  {
    id: "party",
    title: "Party",
    previewUrl: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200.gif",
    url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  },
  {
    id: "coffee",
    title: "Coffee",
    previewUrl: "https://media.giphy.com/media/3o6Zt481isNVuQI1l6/200.gif",
    url: "https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif",
  },
  {
    id: "yes",
    title: "Yes",
    previewUrl: "https://media.giphy.com/media/YTbZzCkRQCEJa/200.gif",
    url: "https://media.giphy.com/media/YTbZzCkRQCEJa/giphy.gif",
  },
  {
    id: "no",
    title: "No",
    previewUrl: "https://media.giphy.com/media/14SAx6S02Io1HoZl0A/200.gif",
    url: "https://media.giphy.com/media/14SAx6S02Io1HoZl0A/giphy.gif",
  },
  {
    id: "heart",
    title: "Heart",
    previewUrl: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/200.gif",
    url: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif",
  },
  {
    id: "shrug",
    title: "Shrug",
    previewUrl: "https://media.giphy.com/media/a5viI92PAF89q/200.gif",
    url: "https://media.giphy.com/media/a5viI92PAF89q/giphy.gif",
  },
  {
    id: "facepalm",
    title: "Facepalm",
    previewUrl: "https://media.giphy.com/media/XsUtdieRKf5624gnN2/200.gif",
    url: "https://media.giphy.com/media/XsUtdieRKf5624gnN2/giphy.gif",
  },
];

export function giphyApiKey(): string | undefined {
  const key = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined)?.trim();
  return key || undefined;
}

export async function searchGifs(query: string, limit = 24): Promise<GifItem[]> {
  const q = query.trim();
  if (!q) return CURATED_GIFS;
  const key = giphyApiKey();
  if (!key) {
    const lower = q.toLowerCase();
    return CURATED_GIFS.filter((g) => g.title.toLowerCase().includes(lower) || g.id.includes(lower));
  }
  const url = new URL("https://api.giphy.com/v1/gifs/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("rating", "pg-13");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`GIF search failed (${resp.status})`);
  const body = (await resp.json()) as {
    data?: Array<{
      id: string;
      title?: string;
      images?: { fixed_height_small?: { url?: string }; original?: { url?: string; width?: string; height?: string } };
    }>;
  };
  return (body.data ?? [])
    .map((item) => ({
      id: item.id,
      title: item.title || "GIF",
      previewUrl: item.images?.fixed_height_small?.url || item.images?.original?.url || "",
      url: item.images?.original?.url || "",
      width: Number(item.images?.original?.width) || undefined,
      height: Number(item.images?.original?.height) || undefined,
    }))
    .filter((item) => item.url && item.previewUrl);
}
