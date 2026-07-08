/** Owner-declared home city for weather and briefings (local until owner-store tier ships). */

export interface LocationPreferences {
  /** City or place label for default forecast when not traveling. */
  homeCity?: string;
}

const STORAGE_KEY = "atom.location.preferences";

export function loadLocationPreferences(): LocationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<LocationPreferences>;
    const homeCity =
      typeof parsed.homeCity === "string" && parsed.homeCity.trim()
        ? parsed.homeCity.trim()
        : undefined;
    return homeCity ? { homeCity } : {};
  } catch {
    return {};
  }
}

export function saveLocationPreferences(prefs: LocationPreferences): void {
  const homeCity = prefs.homeCity?.trim();
  if (homeCity) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ homeCity }));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
