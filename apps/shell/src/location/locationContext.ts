import type { DeviceLocationSnapshot } from "./deviceLocation.js";
import type { LocationPreferences } from "./locationPreferences.js";

/** Fresh one-shot fixes older than this are ignored for default weather location. */
export const DEVICE_LOCATION_FRESH_MS = 60 * 60 * 1000;

export function isDeviceLocationFresh(
  snapshot: DeviceLocationSnapshot | null | undefined,
  nowMs = Date.now(),
): snapshot is DeviceLocationSnapshot {
  if (!snapshot?.capturedAt) return false;
  const captured = Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(captured)) return false;
  return nowMs - captured <= DEVICE_LOCATION_FRESH_MS;
}

export function formatLocationContextForPrompt(
  prefs: LocationPreferences,
  device: DeviceLocationSnapshot | null | undefined,
  nowMs = Date.now(),
): string | undefined {
  const lines: string[] = [];
  const home = prefs.homeCity?.trim();
  if (home) {
    lines.push(`Home location (owner-declared): ${home}`);
  }
  const fresh = isDeviceLocationFresh(device, nowMs) ? device : null;
  if (fresh) {
    const accuracy =
      fresh.accuracyM !== undefined ? ` (±${Math.round(fresh.accuracyM)} m)` : "";
    lines.push(
      `One-shot device location (explicit user gesture — not continuous tracking): latitude ${fresh.latitude.toFixed(5)}, longitude ${fresh.longitude.toFixed(5)}${accuracy}, captured ${fresh.capturedAt}.`,
    );
  } else if (device?.capturedAt) {
    lines.push(
      "A prior one-shot device fix expired — ask before using stale coordinates or fall back to home city.",
    );
  }
  if (lines.length === 0) return undefined;
  lines.push(
    "Weather default: call weather_get_forecast with latitude + longitude when a fresh one-shot fix exists; otherwise location from home city; never assume ambient GPS or background tracking.",
  );
  return lines.join("\n");
}
