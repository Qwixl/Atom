import { useState } from "react";
import {
  captureOneShotDeviceLocation,
  type DeviceLocationSnapshot,
} from "./deviceLocation.js";
import {
  loadLocationPreferences,
  saveLocationPreferences,
  type LocationPreferences,
} from "./locationPreferences.js";

export function LocationSettingsPanel({
  embedded = false,
  deviceLocation,
  onDeviceLocationChange,
}: {
  embedded?: boolean;
  deviceLocation?: DeviceLocationSnapshot | null;
  onDeviceLocationChange?: (snapshot: DeviceLocationSnapshot | null) => void;
}) {
  const [prefs, setPrefs] = useState<LocationPreferences>(() => loadLocationPreferences());
  const [homeInput, setHomeInput] = useState(() => loadLocationPreferences().homeCity ?? "");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function persistHome(nextHome: string) {
    const homeCity = nextHome.trim() || undefined;
    const next = homeCity ? { homeCity } : {};
    setPrefs(next);
    saveLocationPreferences(next);
    setNote("Home location saved.");
    window.setTimeout(() => setNote(null), 2000);
  }

  async function useCurrentLocationOnce() {
    setBusy(true);
    setNote("Requesting one-shot location…");
    try {
      const result = await captureOneShotDeviceLocation();
      if (!result.ok) {
        setNote(result.message);
        return;
      }
      onDeviceLocationChange?.(result.snapshot);
      setNote(
        `Using current location for this session (${result.snapshot.latitude.toFixed(4)}, ${result.snapshot.longitude.toFixed(4)}). Atom does not track location in the background.`,
      );
    } finally {
      setBusy(false);
    }
  }

  function clearDeviceLocation() {
    onDeviceLocationChange?.(null);
    setNote("Cleared one-shot device location.");
    window.setTimeout(() => setNote(null), 2000);
  }

  const body = (
    <>
      {!embedded ? (
        <>
          <h3>Location</h3>
          <p className="settings-note">
            Home city powers default weather in briefings. One-shot device location runs only when you tap the button below — never in the background.
          </p>
        </>
      ) : null}
      <label className="atom-field">
        <span className="atom-field-label">Home city or place</span>
        <div className="chrome-actions settings-section-actions">
          <input
            value={homeInput}
            onChange={(e) => setHomeInput(e.target.value)}
            placeholder="e.g. Berlin, London"
            autoComplete="off"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                persistHome(homeInput);
              }
            }}
          />
          <button type="button" disabled={busy} onClick={() => persistHome(homeInput)}>
            Save home
          </button>
        </div>
      </label>
      {prefs.homeCity ? (
        <p className="settings-note">Saved home: {prefs.homeCity}</p>
      ) : (
        <p className="settings-note">No home location yet — weather requests may ask where you are.</p>
      )}
      <div className="chrome-actions settings-section-actions">
        <button type="button" className="chrome-approve" disabled={busy} onClick={() => void useCurrentLocationOnce()}>
          Use current location once
        </button>
        {deviceLocation ? (
          <button type="button" disabled={busy} onClick={clearDeviceLocation}>
            Clear session location
          </button>
        ) : null}
      </div>
      {deviceLocation ? (
        <p className="settings-note">
          Session fix: {deviceLocation.latitude.toFixed(4)}, {deviceLocation.longitude.toFixed(4)} (captured{" "}
          {new Date(deviceLocation.capturedAt).toLocaleString()}).
        </p>
      ) : null}
      {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
    </>
  );

  if (embedded) {
    return <div className="settings-panel-fields connector-settings">{body}</div>;
  }
  return <section className="settings-section connector-settings">{body}</section>;
}
