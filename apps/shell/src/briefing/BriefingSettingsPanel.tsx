import { useState } from "react";
import {
  loadBriefingPreferences,
  saveBriefingPreferences,
  type BriefingPreferences,
} from "./briefingPreferences.js";
import { LocationSettingsPanel } from "../location/LocationSettingsPanel.js";
import type { DeviceLocationSnapshot } from "../location/deviceLocation.js";
import { SettingsToggle } from "../ui/SettingsToggle.js";

export function BriefingSettingsPanel({
  embedded = false,
  deviceLocation,
  onDeviceLocationChange,
}: {
  embedded?: boolean;
  deviceLocation?: DeviceLocationSnapshot | null;
  onDeviceLocationChange?: (snapshot: DeviceLocationSnapshot | null) => void;
}) {
  const [prefs, setPrefs] = useState<BriefingPreferences>(() => loadBriefingPreferences());
  const [topicInput, setTopicInput] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function persist(next: BriefingPreferences) {
    setPrefs(next);
    saveBriefingPreferences(next);
    setNote("Saved.");
    window.setTimeout(() => setNote(null), 2000);
  }

  function toggleEnabled(enabled: boolean) {
    persist({ ...prefs, enabled });
  }

  function addTopic() {
    const topic = topicInput.trim();
    if (!topic) return;
    if (prefs.topics.includes(topic)) {
      setNote("Topic already listed.");
      return;
    }
    persist({ ...prefs, topics: [...prefs.topics, topic].slice(-20) });
    setTopicInput("");
  }

  function removeTopic(topic: string) {
    persist({ ...prefs, topics: prefs.topics.filter((item) => item !== topic) });
  }

  const body = (
    <>
      {!embedded ? (
        <>
          <h3>Daily briefing</h3>
          <p className="settings-note">
            Get a short roundup when you open Chat. Add calendar and news feeds under Connectors first.
          </p>
        </>
      ) : null}
      <ul className="settings-checkbox-list">
        <li>
          <SettingsToggle
            checked={prefs.enabled}
            label="Show a briefing when I open Chat"
            onChange={toggleEnabled}
          />
        </li>
      </ul>
      <label className="atom-field">
        <span className="atom-field-label">Topics to watch (optional)</span>
        <div className="chrome-actions settings-section-actions">
          <input
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="e.g. product launches, team meetings"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTopic();
              }
            }}
          />
          <button type="button" disabled={!topicInput.trim()} onClick={addTopic}>
            Add topic
          </button>
        </div>
      </label>
      {prefs.topics.length > 0 ? (
        <ul className="webcal-feeds">
          {prefs.topics.map((topic) => (
            <li key={topic}>
              <span>{topic}</span>
              <button type="button" className="webcal-remove" onClick={() => removeTopic(topic)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-note">No topics yet — briefings still cover your calendar and feeds.</p>
      )}
      {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
      <LocationSettingsPanel
        embedded
        deviceLocation={deviceLocation}
        onDeviceLocationChange={onDeviceLocationChange}
      />
    </>
  );

  if (embedded) {
    return <div className="settings-panel-fields connector-settings">{body}</div>;
  }
  return <section className="settings-section connector-settings">{body}</section>;
}
