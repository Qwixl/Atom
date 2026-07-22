import { useState } from "react";
import {
  COMMS_ABUSE_CATEGORIES,
  submitCommsAbuseReport,
  type CommsAbuseCategory,
} from "./moduleFeedback.js";

export interface ContactAbuseTarget {
  did: string;
  endpoint?: string;
  handle?: string;
  name?: string;
  roomId?: string;
}

interface ContactAbuseReportFormProps {
  target: ContactAbuseTarget;
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onReported: (note: string, alsoBlock: boolean) => void;
  onCancel: () => void;
  /** When reporting a room (not a peer), hide the block-contact checkbox. */
  hideAlsoBlock?: boolean;
  surface?: "chat" | "messages" | "rooms" | "modules" | "other";
}

export function ContactAbuseReportForm({
  target,
  busy: busyExternal,
  onBusyChange,
  onReported,
  onCancel,
  hideAlsoBlock = false,
  surface,
}: ContactAbuseReportFormProps) {
  const [category, setCategory] = useState<CommsAbuseCategory>("other");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(!hideAlsoBlock);
  const [localBusy, setLocalBusy] = useState(false);
  const busy = busyExternal || localBusy;

  async function submit() {
    setLocalBusy(true);
    onBusyChange?.(true);
    try {
      await submitCommsAbuseReport({
        peerDid: target.did,
        peerEndpoint: target.endpoint,
        peerHandle: target.handle,
        peerName: target.name,
        roomId: target.roomId,
        category,
        details,
        alsoBlock: hideAlsoBlock ? false : alsoBlock,
        surface: surface ?? (target.roomId ? "rooms" : "messages"),
      });
      setDetails("");
      onReported(
        !hideAlsoBlock && alsoBlock
          ? "Report queued. This contact will be blocked locally."
          : "Report queued for host operators. Thank you.",
        hideAlsoBlock ? false : alsoBlock,
      );
    } catch (error) {
      onReported(error instanceof Error ? error.message : String(error), false);
    } finally {
      setLocalBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="comms-abuse-report-form settings-registry-feedback-form">
      <label className="atom-field">
        <span className="atom-field-label">Category</span>
        <select
          className="panel-select"
          value={category}
          disabled={busy}
          onChange={(event) => setCategory(event.target.value as CommsAbuseCategory)}
        >
          {COMMS_ABUSE_CATEGORIES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className="panel-textarea"
        rows={3}
        maxLength={2000}
        placeholder="What happened? Do not paste private message contents — describe timing and behavior."
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        disabled={busy}
      />
      {hideAlsoBlock ? null : (
        <label className="atom-field atom-field-checkbox">
          <input
            type="checkbox"
            checked={alsoBlock}
            disabled={busy}
            onChange={(event) => setAlsoBlock(event.target.checked)}
          />
          <span>Also block this contact after reporting</span>
        </label>
      )}
      <div className="comms-contact-actions">
        <button type="button" className="panel-btn" disabled={busy} onClick={() => void submit()}>
          Submit report
        </button>
        <button type="button" className="panel-btn panel-btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
