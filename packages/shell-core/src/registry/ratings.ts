import type { RegistryRatings } from "./types.js";
import { resolveRegistryUrl } from "./resolveUrl.js";

export async function fetchRegistryRatings(
  indexUrl: string,
  ratingsUrl: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<RegistryRatings | null> {
  if (!ratingsUrl?.trim()) return null;
  const url = resolveRegistryUrl(ratingsUrl, indexUrl);
  const response = await fetchFn(url);
  if (!response.ok) return null;
  const body = (await response.json()) as RegistryRatings;
  if (body.ratingsVersion !== 1 || !body.modules) return null;
  return body;
}

export function formatStarRating(average: number): string {
  const clamped = Math.max(0, Math.min(5, average));
  const full = Math.round(clamped);
  return "★".repeat(full) + "☆".repeat(5 - full);
}
