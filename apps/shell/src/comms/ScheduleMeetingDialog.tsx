import { useEffect, useId, useRef, useState } from "react";
import type { SchedulingSlot } from "@qwixl/a2a-transport";

function defaultStartValue(): string {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const offset = next.getTimezoneOffset();
  const local = new Date(next.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function slotFromInputs(title: string, startLocal: string, durationMin: number): SchedulingSlot | null {
  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + durationMin * 60_000);
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

export function ScheduleMeetingDialog({
  open,
  peerName,
  busy,
  onClose,
  onSend,
}: {
  open: boolean;
  peerName: string;
  busy: boolean;
  onClose: () => void;
  onSend: (title: string, slots: SchedulingSlot[]) => void | Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [title, setTitle] = useState("Meeting");
  const [startAt, setStartAt] = useState(defaultStartValue);
  const [durationMin, setDurationMin] = useState(30);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setTitle("Meeting");
      setStartAt(defaultStartValue());
      setDurationMin(30);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const slot = slotFromInputs(title, startAt, durationMin);
  const valid = Boolean(title.trim() && slot);

  return (
    <dialog
      ref={dialogRef}
      className="comms-schedule-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <form
        className="comms-schedule-dialog-inner"
        onSubmit={(event) => {
          event.preventDefault();
          if (!slot || !title.trim()) return;
          void onSend(title.trim(), [slot]);
        }}
      >
        <header className="comms-schedule-dialog-head">
          <h2 id={titleId}>Schedule with {peerName}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="comms-schedule-dialog-body">
          <label className="atom-field">
            <span>Title</span>
            <input
              className="panel-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </label>
          <label className="atom-field">
            <span>Date & time</span>
            <input
              className="panel-input"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className="atom-field">
            <span>Duration</span>
            <select
              className="panel-input"
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
            </select>
          </label>
        </div>
        <footer className="comms-schedule-dialog-actions">
          <button type="button" className="panel-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="panel-btn panel-btn-primary" disabled={busy || !valid}>
            Send proposal
          </button>
        </footer>
      </form>
    </dialog>
  );
}
