/** One-shot browser geolocation — never polled or persisted. */

export interface DeviceLocationSnapshot {
  latitude: number;
  longitude: number;
  accuracyM?: number;
  /** ISO timestamp when the owner tapped "Use current location". */
  capturedAt: string;
}

export type DeviceLocationError =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unknown";

export async function captureOneShotDeviceLocation(): Promise<
  { ok: true; snapshot: DeviceLocationSnapshot } | { ok: false; error: DeviceLocationError; message: string }
> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, error: "unsupported", message: "Geolocation is not available in this browser." };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          snapshot: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
            capturedAt: new Date().toISOString(),
          },
        });
      },
      (error) => {
        const code = error.code;
        if (code === error.PERMISSION_DENIED) {
          resolve({ ok: false, error: "denied", message: "Location permission denied." });
          return;
        }
        if (code === error.POSITION_UNAVAILABLE) {
          resolve({ ok: false, error: "unavailable", message: "Location unavailable." });
          return;
        }
        if (code === error.TIMEOUT) {
          resolve({ ok: false, error: "timeout", message: "Location request timed out." });
          return;
        }
        resolve({ ok: false, error: "unknown", message: error.message || "Location request failed." });
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 15_000 },
    );
  });
}
