import { useMemo, useState } from "react";
import type { SchedulingSlot } from "@qwixl/a2a-transport";

function defaultDateValue(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function buildSlot(date: string, time: string, durationMinutes: number): SchedulingSlot {
  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const label = start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    id: `slot-${start.toISOString()}`,
    label,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function DemoProposalComposer({
  peerName,
  busy,
  onSend,
}: {
  peerName: string;
  busy: boolean;
  onSend: (title: string, slots: SchedulingSlot[]) => void;
}) {
  const [title, setTitle] = useState(`Meeting with ${peerName}`);
  const [date, setDate] = useState(defaultDateValue);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);

  const previewSlot = useMemo(
    () => buildSlot(date, time, duration),
    [date, duration, time],
  );

  return (
    <section className="demo-proposal-composer" aria-label="Propose a meeting">
      <header className="demo-section-head">
        <h4>Propose a meeting</h4>
        <p>Your agent will send this request to {peerName} — agent to agent.</p>
      </header>

      <div className="demo-composer-grid">
        <label className="demo-field demo-field--title" data-demo-target="title">
          <span className="demo-field-label">Meeting title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="demo-field-when" data-demo-target="when">
          <label className="demo-field">
            <span className="demo-field-label">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="demo-field">
            <span className="demo-field-label">Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="demo-field">
            <span className="demo-field-label">Mins</span>
            <input
              type="number"
              min={15}
              step={15}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 30)}
            />
          </label>
        </div>
      </div>

      <div className="demo-composer-footer">
        <p className="demo-proposal-preview">
          Offering: <strong>{previewSlot.label}</strong>
        </p>
        <button
          type="button"
          className="chrome-approve demo-composer-send"
          data-demo-target="send"
          disabled={busy || !title.trim() || !date || !time}
          onClick={() => onSend(title.trim(), [previewSlot])}
        >
          {busy ? "Sending…" : `Send to ${peerName}`}
        </button>
      </div>
    </section>
  );
}
