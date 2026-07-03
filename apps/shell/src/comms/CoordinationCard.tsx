import { useMemo } from "react";
import type { RsvpAnswer, SchedulingSlot } from "@qwixl/a2a-transport";
import type { CommsThreadItem } from "./types.js";
import { formatRsvpResponse, formatSchedulingResponse } from "./coordinationThread.js";

export function CoordinationCard({
  item,
  busy,
  showActions,
  onAcceptSlot,
  onDeclineProposal,
  onRsvp,
}: {
  item: CommsThreadItem;
  busy: boolean;
  showActions: boolean;
  onAcceptSlot: (proposalId: string, slot: SchedulingSlot) => void;
  onDeclineProposal: (proposalId: string) => void;
  onRsvp: (rsvpId: string, response: RsvpAnswer) => void;
}) {
  const directionClass = item.direction === "in" ? "in" : "out";

  if (item.kind === "scheduling-proposal") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Scheduling proposal</strong>
          <span>{item.title}</span>
        </div>
        <ul className="shell-comms-coord-slots">
          {item.slots.map((slot) => (
            <li key={slot.id}>
              <span>{slot.label}</span>
              {showActions ? (
                <button
                  type="button"
                  className="chrome-approve"
                  disabled={busy}
                  onClick={() => onAcceptSlot(item.id, slot)}
                >
                  Accept
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {showActions ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDeclineProposal(item.id)}
          >
            Decline
          </button>
        ) : null}
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "scheduling-response") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Scheduling response</strong>
          <span>{formatSchedulingResponse(item.response, item.slotId)}</span>
        </div>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "rsvp-request") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>RSVP request</strong>
          <span>{item.eventTitle}</span>
        </div>
        <p className="shell-comms-coord-meta">
          {new Date(item.eventAt).toLocaleString()}
          {item.location ? ` · ${item.location}` : null}
        </p>
        {showActions ? (
          <div className="shell-comms-coord-rsvp">
            {(["yes", "maybe", "no"] as const).map((answer) => (
              <button
                key={answer}
                type="button"
                className={answer === "yes" ? "chrome-approve" : undefined}
                disabled={busy}
                onClick={() => onRsvp(item.id, answer)}
              >
                {answer === "yes" ? "Yes" : answer === "maybe" ? "Maybe" : "No"}
              </button>
            ))}
          </div>
        ) : null}
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "rsvp-response") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>{formatRsvpResponse(item.response)}</strong>
        </div>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  return null;
}

export function ThreadItemView({
  item,
  busy,
  showActions,
  onAcceptSlot,
  onDeclineProposal,
  onRsvp,
}: {
  item: CommsThreadItem;
  busy: boolean;
  showActions: boolean;
  onAcceptSlot: (proposalId: string, slot: SchedulingSlot) => void;
  onDeclineProposal: (proposalId: string) => void;
  onRsvp: (rsvpId: string, response: RsvpAnswer) => void;
}) {
  if (item.kind === "message") {
    return (
      <div className={`shell-comms-msg shell-comms-msg-${item.direction}`}>
        <div className="shell-comms-msg-text">{item.text}</div>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  return (
    <CoordinationCard
      item={item}
      busy={busy}
      showActions={showActions}
      onAcceptSlot={onAcceptSlot}
      onDeclineProposal={onDeclineProposal}
      onRsvp={onRsvp}
    />
  );
}

/** Proposal/RSVP ids the local user already responded to (hide action buttons). */
export function useRespondedProposalIds(thread: CommsThreadItem[]): Set<string> {
  return useMemo(() => {
    const ids = new Set<string>();
    for (const item of thread) {
      if (item.kind === "scheduling-response" && item.direction === "out") {
        ids.add(item.proposalId);
      }
      if (item.kind === "rsvp-response" && item.direction === "out") {
        ids.add(item.rsvpId);
      }
    }
    return ids;
  }, [thread]);
}

export function threadItemNeedsActions(
  item: CommsThreadItem,
  respondedIds: Set<string>,
): boolean {
  if (item.direction !== "in") return false;
  if (item.kind === "scheduling-proposal") return !respondedIds.has(item.id);
  if (item.kind === "rsvp-request") return !respondedIds.has(item.id);
  return false;
}
