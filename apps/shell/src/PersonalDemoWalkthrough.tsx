import { useMemo, useState } from "react";
import { type DemoCalendarEvent, formatEventRange } from "./demoScheduling.js";

export type PersonalDemoStepId =
  | "agent"
  | "llm"
  | "webcal"
  | "schedule"
  | "calendar"
  | "done";

const DEMO_PROMPT = "Schedule a team standup next week";

const STEPS: Array<{ id: PersonalDemoStepId; title: string }> = [
  { id: "agent", title: "Your agent is running" },
  { id: "llm", title: "Add your LLM API key" },
  { id: "webcal", title: "Connect your calendar feed" },
  { id: "schedule", title: "Ask your agent to schedule a meeting" },
  { id: "calendar", title: "Add the meeting to your calendar" },
  { id: "done", title: "Done" },
];

function stepComplete(
  id: PersonalDemoStepId,
  state: {
    agentReady: boolean;
    llmReady: boolean;
    webcalReady: boolean;
    scheduleSent: boolean;
    calendarAdded: boolean;
  },
): boolean {
  switch (id) {
    case "agent":
      return state.agentReady;
    case "llm":
      return state.llmReady;
    case "webcal":
      return state.webcalReady;
    case "schedule":
      return state.scheduleSent;
    case "calendar":
      return state.calendarAdded;
    case "done":
      return state.calendarAdded;
    default:
      return false;
  }
}

export function derivePersonalDemoStep(state: {
  agentReady: boolean;
  llmReady: boolean;
  webcalReady: boolean;
  scheduleSent: boolean;
  calendarAdded: boolean;
}): PersonalDemoStepId {
  for (const step of STEPS) {
    if (!stepComplete(step.id, state)) return step.id;
  }
  return "done";
}

export function PersonalDemoWalkthrough({
  agentReady,
  llmReady,
  webcalReady,
  calendarEvents,
  scheduleSent,
  calendarAdded,
  waitingForConfirm,
  onSaveLlm,
  onSaveWebcal,
  onSendDemoMessage,
}: {
  agentReady: boolean;
  llmReady: boolean;
  webcalReady: boolean;
  calendarEvents: DemoCalendarEvent[];
  scheduleSent: boolean;
  calendarAdded: boolean;
  waitingForConfirm: boolean;
  onSaveLlm: (apiKey: string) => void;
  onSaveWebcal: (url: string) => Promise<void>;
  onSendDemoMessage: (text: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const current = useMemo(
    () =>
      derivePersonalDemoStep({
        agentReady,
        llmReady,
        webcalReady,
        scheduleSent,
        calendarAdded,
      }),
    [agentReady, calendarAdded, llmReady, scheduleSent, webcalReady],
  );

  async function saveWebcal() {
    const url = feedUrl.trim();
    if (!url) return;
    setBusy(true);
    setNote(null);
    try {
      await onSaveWebcal(url);
      setFeedUrl("");
      setNote("Calendar connected — fetching events from your feed…");
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="personal-demo-walkthrough" aria-label="Getting started">
      <header className="personal-demo-walkthrough-head">
        <h2>Real-world demo</h2>
        <p>
          Your agent, your LLM key, your calendar — then schedule a meeting and add it to Google
          Calendar. Follow each step in order.
        </p>
      </header>

      <ol className="personal-demo-steps">
        {STEPS.filter((s) => s.id !== "done").map((step, index) => {
          const done = stepComplete(step.id, {
            agentReady,
            llmReady,
            webcalReady,
            scheduleSent,
            calendarAdded,
          });
          const active = step.id === current;
          return (
            <li
              key={step.id}
              className={`personal-demo-step${done ? " is-done" : ""}${active ? " is-active" : ""}`}
            >
              <span className="personal-demo-step-num">{done ? "✓" : index + 1}</span>
              <div className="personal-demo-step-body">
                <h3>{step.title}</h3>

                {step.id === "agent" && active ? (
                  <p className="personal-demo-step-copy">
                    {agentReady
                      ? "Your personal agent is running on this machine (port 5204)."
                      : "Waiting for your agent to start — check the terminal running pnpm dev:demo."}
                  </p>
                ) : null}

                {step.id === "llm" && active ? (
                  <>
                    <p className="personal-demo-step-copy">
                      Paste an OpenAI-compatible API key. It is stored locally on this machine for
                      Live LLM mode after the demo.
                    </p>
                    <label className="atom-field">
                      <span className="atom-field-label">API key</span>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-…"
                        autoComplete="off"
                        disabled={busy || llmReady}
                      />
                    </label>
                    <button
                      type="button"
                      className="chrome-approve"
                      disabled={busy || llmReady || !apiKey.trim()}
                      onClick={() => {
                        onSaveLlm(apiKey.trim());
                        setApiKey("");
                        setNote("LLM connected — Live agent mode enabled.");
                      }}
                    >
                      {llmReady ? "LLM key saved" : "Save API key"}
                    </button>
                  </>
                ) : null}

                {step.id === "webcal" && active ? (
                  <>
                    <p className="personal-demo-step-copy">
                      Paste the <strong>secret iCal link</strong> from Google Calendar (Settings → your
                      calendar → Integrate calendar → Secret address in iCal format). Stored encrypted on
                      your agent — read-only, for checking busy times.
                    </p>
                    {!webcalReady ? (
                      <>
                        <label className="atom-field">
                          <span className="atom-field-label">Feed URL</span>
                          <input
                            value={feedUrl}
                            onChange={(e) => setFeedUrl(e.target.value)}
                            placeholder="webcal://… or https://…/basic.ics"
                            autoComplete="off"
                            disabled={busy}
                          />
                        </label>
                        <button
                          type="button"
                          className="chrome-approve"
                          disabled={busy || !feedUrl.trim()}
                          onClick={() => void saveWebcal()}
                        >
                          Connect calendar
                        </button>
                      </>
                    ) : (
                      <p className="personal-demo-step-copy personal-demo-step-success">
                        Calendar connected. Your agent reads busy times from this feed when suggesting
                        slots.
                      </p>
                    )}
                  </>
                ) : null}

                {step.id === "webcal" && webcalReady ? (
                  <div className="personal-demo-calendar-preview">
                    <h4>Your calendar (next 2 weeks)</h4>
                    {calendarEvents.length === 0 ? (
                      <p className="personal-demo-step-hint">
                        No upcoming events — proposed slots will show as free.
                      </p>
                    ) : (
                      <ul className="personal-demo-calendar-list">
                        {calendarEvents.slice(0, 8).map((event) => (
                          <li key={event.uid}>
                            <strong>{event.summary || "Untitled"}</strong>
                            <span>{formatEventRange(event.start, event.end)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}

                {step.id === "schedule" && active ? (
                  <>
                    <p className="personal-demo-step-copy">
                      Send this message to your agent. It will offer time slots — pick one, then
                      confirm in the overlay.
                    </p>
                    <p className="personal-demo-prompt">
                      <code>{DEMO_PROMPT}</code>
                    </p>
                    <button
                      type="button"
                      className="chrome-approve"
                      disabled={!llmReady || !webcalReady || scheduleSent}
                      onClick={() => onSendDemoMessage(DEMO_PROMPT)}
                    >
                      {scheduleSent ? "Message sent — pick a slot below" : "Send this message"}
                    </button>
                    {!llmReady ? (
                      <p className="personal-demo-step-hint">Complete step 2 first (LLM API key).</p>
                    ) : !webcalReady ? (
                      <p className="personal-demo-step-hint">Complete step 3 first (calendar feed).</p>
                    ) : null}
                  </>
                ) : null}

                {step.id === "calendar" && active ? (
                  <>
                    <p className="personal-demo-step-copy">
                      Choose a time slot in the chat, then click <strong>Add to calendar</strong> in
                      the confirmation overlay. Google Calendar opens with the event prefilled — click
                      Save there to add it to your real calendar.
                    </p>
                    {waitingForConfirm ? (
                      <p className="personal-demo-step-hint personal-demo-step-hint-active">
                        Confirmation open — approve to open Google Calendar.
                      </p>
                    ) : null}
                    {calendarAdded ? (
                      <p className="personal-demo-step-copy personal-demo-step-success">
                        Event sent to Google Calendar. Check your calendar app to confirm it saved.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {note ? <p className="personal-demo-note">{note}</p> : null}
    </section>
  );
}
