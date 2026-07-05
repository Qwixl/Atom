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
    <section className="demo-proposal-composer">
      <h4>Send proposal</h4>
      <p className="comms-hint">Pick a time and send to {peerName}.</p>
      <label className="atom-field">
        <span className="atom-field-label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="demo-proposal-datetime">
        <label className="atom-field">
          <span className="atom-field-label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="atom-field">
          <span className="atom-field-label">Duration (min)</span>
          <input
            type="number"
            min={15}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 30)}
          />
        </label>
      </div>
      <p className="demo-proposal-preview">
        Proposed slot: <strong>{previewSlot.label}</strong>
      </p>
      <button
        type="button"
        className="chrome-approve"
        disabled={busy || !title.trim() || !date || !time}
        onClick={() => onSend(title.trim(), [previewSlot])}
      >
        Send proposal to {peerName}
      </button>
    </section>
  );
}
