import { useState } from "react";
import {
  loadBriefingPreferences,
  saveBriefingPreferences,
  type BriefingPreferences,
} from "./briefingPreferences.js";

type ChatProvider = "mock" | "llm" | "ag-ui";

export function BriefingSettingsPanel({
  embedded = false,
  chatProvider,
  vaultUnlocked = false,
  agentConnectionReady = false,
  onTestBriefing,
}: {
  embedded?: boolean;
  chatProvider: ChatProvider;
  vaultUnlocked?: boolean;
  agentConnectionReady?: boolean;
  onTestBriefing?: () => void;
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

  const prerequisitesMet =
    chatProvider === "llm" && vaultUnlocked && agentConnectionReady;

  const body = (
    <>
      {!embedded ? (
        <>
          <h3>Daily briefing</h3>
          <p className="settings-note">
            When enabled, Atom sends one roundup request when you open Chat with Live LLM. Connect
            calendar and RSS feeds under Connectors first.
          </p>
        </>
      ) : null}
      <ul className="settings-checkbox-list">
        <li>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={prefs.enabled}
              onChange={(e) => toggleEnabled(e.target.checked)}
            />
            <span className="settings-checkbox-text">
              Brief me when I open Chat (session start)
            </span>
          </label>
        </li>
      </ul>
      <label className="atom-field">
        <span className="atom-field-label">Topics to prioritize (optional)</span>
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
        <p className="settings-note">No topics yet — the agent still summarizes calendar and RSS.</p>
      )}
      <section className="settings-section" aria-labelledby="briefing-manual-test-heading">
        <h4 id="briefing-manual-test-heading">How to test manually</h4>
        <ol className="settings-note">
          <li>Settings → Agent — select Live LLM and save your API key.</li>
          <li>Settings → Connectors — add at least one WebCal or RSS feed.</li>
          <li>Settings → Briefing — enable briefing and add topics (optional).</li>
          <li>Unlock your vault if prompted, then open Chat — a roundup runs automatically once per session.</li>
          <li>Or use Test briefing now below to trigger immediately without reloading.</li>
        </ol>
        {chatProvider !== "llm" ? (
          <p className="settings-note webcal-settings-warn">
            Switch Chat to Live LLM (Settings → Agent) to run briefings.
          </p>
        ) : null}
        {chatProvider === "llm" && !vaultUnlocked ? (
          <p className="settings-note webcal-settings-warn">Unlock your vault to reach the agent.</p>
        ) : null}
        {chatProvider === "llm" && vaultUnlocked && !agentConnectionReady ? (
          <p className="settings-note webcal-settings-warn">
            Connect your agent (pnpm start:agent) before testing.
          </p>
        ) : null}
        <div className="chrome-actions settings-section-actions">
          <button
            type="button"
            className="chrome-approve"
            disabled={!prefs.enabled || !prerequisitesMet || !onTestBriefing}
            onClick={onTestBriefing}
          >
            Test briefing now
          </button>
        </div>
      </section>
      {note ? <p className="settings-note webcal-settings-note">{note}</p> : null}
    </>
  );

  if (embedded) {
    return <div className="settings-panel-fields connector-settings">{body}</div>;
  }
  return <section className="settings-section connector-settings">{body}</section>;
}
