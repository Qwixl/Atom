import { useMemo } from "react";
import type { RsvpAnswer, SchedulingSlot } from "@qwixl/a2a-transport";
import { detectInstructionLikeContent } from "@qwixl/agent-llm";
import type { CommsThreadItem } from "./types.js";
import { formatMonetaryAmount, formatRsvpResponse, formatSchedulingResponse } from "./coordinationThread.js";

export function CoordinationCard({
  item,
  busy,
  showActions,
  onAcceptSlot,
  onDeclineProposal,
  onRsvp,
  onConfirmTransaction,
  onDeclineTransaction,
}: {
  item: CommsThreadItem;
  busy: boolean;
  showActions: boolean;
  onAcceptSlot: (proposalId: string, slot: SchedulingSlot) => void;
  onDeclineProposal: (proposalId: string) => void;
  onRsvp: (rsvpId: string, response: RsvpAnswer) => void;
  onConfirmTransaction: (transactionId: string, label?: string) => void;
  onDeclineTransaction: (transactionId: string, label?: string) => void;
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

  if (item.kind === "action-reserve") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Soft reserve</strong>
          <span>{item.label}</span>
        </div>
        <p className="shell-comms-coord-meta">
          {item.refKind} · attestation {item.attestationRef}
        </p>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "transaction-hold") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass} shell-comms-txn`}>
        <div className="shell-comms-coord-head">
          <strong>Payment hold</strong>
          <span>{item.label ?? item.transactionId}</span>
        </div>
        <p className="shell-comms-coord-meta">
          {formatMonetaryAmount(item.amount)} · {item.rail}
          {item.expiresAt ? ` · expires ${new Date(item.expiresAt).toLocaleString()}` : null}
        </p>
        {showActions ? (
          <div className="shell-comms-coord-rsvp">
            <button
              type="button"
              className="chrome-approve"
              disabled={busy}
              onClick={() => onConfirmTransaction(item.transactionId, item.label)}
            >
              Confirm &amp; capture
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDeclineTransaction(item.transactionId, item.label)}
            >
              Decline
            </button>
          </div>
        ) : null}
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "transaction-confirm") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass} shell-comms-txn`}>
        <div className="shell-comms-coord-head">
          <strong>Transaction confirm</strong>
          <span>{item.role === "payer" ? "Payer confirmed" : "Payee confirmed"}</span>
        </div>
        <p className="shell-comms-coord-meta">
          {formatMonetaryAmount(item.amount)}
          {item.label ? ` · ${item.label}` : null}
        </p>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "transaction-status") {
    const title =
      item.status === "capture"
        ? "Funds captured"
        : item.status === "receipt"
          ? "Receipt"
          : `Hold released${item.reason ? ` (${item.reason})` : ""}`;
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass} shell-comms-txn`}>
        <div className="shell-comms-coord-head">
          <strong>{title}</strong>
          <span>{item.transactionId}</span>
        </div>
        {item.amount ? (
          <p className="shell-comms-coord-meta">{formatMonetaryAmount(item.amount)}</p>
        ) : null}
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
  onConfirmTransaction,
  onDeclineTransaction,
}: {
  item: CommsThreadItem;
  busy: boolean;
  showActions: boolean;
  onAcceptSlot: (proposalId: string, slot: SchedulingSlot) => void;
  onDeclineProposal: (proposalId: string) => void;
  onRsvp: (rsvpId: string, response: RsvpAnswer) => void;
  onConfirmTransaction: (transactionId: string, label?: string) => void;
  onDeclineTransaction: (transactionId: string, label?: string) => void;
}) {
  if (item.kind === "message") {
    const suspicious = item.direction === "in" && detectInstructionLikeContent(item.text);
    return (
      <div className={`shell-comms-msg shell-comms-msg-${item.direction}`}>
        {suspicious ? (
          <div className="shell-comms-msg-warning">
            This message contains instruction-like text aimed at your agent. Your agent treats
            counterpart messages as data, never commands (D031).
          </div>
        ) : null}
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
      onConfirmTransaction={onConfirmTransaction}
      onDeclineTransaction={onDeclineTransaction}
    />
  );
}

export function useRespondedTransactionIds(thread: CommsThreadItem[]): Set<string> {
  return useMemo(() => {
    const ids = new Set<string>();
    for (const item of thread) {
      if (item.direction !== "out") continue;
      if (item.kind === "transaction-confirm") ids.add(item.transactionId);
      if (item.kind === "transaction-status" && item.status === "release") {
        ids.add(item.transactionId);
      }
    }
    return ids;
  }, [thread]);
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
  respondedTxnIds: Set<string>,
): boolean {
  if (item.direction !== "in") return false;
  if (item.kind === "scheduling-proposal") return !respondedIds.has(item.id);
  if (item.kind === "rsvp-request") return !respondedIds.has(item.id);
  if (item.kind === "transaction-hold") return !respondedTxnIds.has(item.transactionId);
  return false;
}
