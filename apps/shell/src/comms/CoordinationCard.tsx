import { useMemo } from "react";
import type { MonetaryAmount, RsvpAnswer, SchedulingSlot } from "@qwixl/a2a-transport";
import { detectInstructionLikeContent } from "@qwixl/agent-llm";
import type { CommsThreadItem } from "./types.js";
import { formatMonetaryAmount, formatRsvpResponse, formatSchedulingResponse } from "./coordinationThread.js";
import type { SharedListItem } from "./sharedListLogic.js";

export function CoordinationCard({
  item,
  busy,
  showActions,
  onAcceptSlot,
  onDeclineProposal,
  onRsvp,
  onConfirmTransaction,
  onDeclineTransaction,
  onAcceptOffer,
  onPollVote,
  onPaySplitShare,
  onTttCell,
  onBsFire,
  sharedListItems,
  onSharedListChange,
}: {
  item: CommsThreadItem;
  busy: boolean;
  showActions: boolean;
  onAcceptSlot: (proposalId: string, slot: SchedulingSlot) => void;
  onDeclineProposal: (proposalId: string) => void;
  onRsvp: (rsvpId: string, response: RsvpAnswer) => void;
  onConfirmTransaction: (transactionId: string, label?: string) => void;
  onDeclineTransaction: (transactionId: string, label?: string) => void;
  onAcceptOffer: (
    offerId: string,
    intentId: string,
    label: string,
    amount: MonetaryAmount,
  ) => void;
  onPollVote?: (pollId: string, optionId: string) => void;
  onPaySplitShare?: (
    splitId: string,
    label: string,
    amount: MonetaryAmount,
  ) => void;
  onTttCell?: (gameId: string, cell: number, mark: "X" | "O") => void;
  onBsFire?: (gameId: string, cell: number) => void;
  sharedListItems?: SharedListItem[];
  onSharedListChange?: (listId: string, items: SharedListItem[]) => void;
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
          <span>
            {formatSchedulingResponse(item.response, {
              slotId: item.slotId,
              slotLabel: item.slotLabel,
            })}
          </span>
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

  if (item.kind === "commerce-intent") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Purchase intent</strong>
          <span>{item.intentId}</span>
        </div>
        <p className="shell-comms-coord-meta">
          {item.catalogItemId ? `Item ${item.catalogItemId}` : item.query ?? "General query"}
        </p>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "commerce-offer") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass} shell-comms-txn`}>
        <div className="shell-comms-coord-head">
          <strong>Signed offer</strong>
          <span>{item.label}</span>
        </div>
        <p className="shell-comms-coord-meta">
          {formatMonetaryAmount(item.amount)}
          {item.sponsored ? " · sponsored (disclosed)" : ""}
        </p>
        {item.terms.length > 0 ? (
          <ul className="shell-comms-offer-terms">
            {item.terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        ) : null}
        {showActions && item.available ? (
          <div className="shell-comms-coord-rsvp">
            <button
              type="button"
              className="chrome-approve"
              disabled={busy}
              onClick={() => onAcceptOffer(item.offerId, item.intentId, item.label, item.amount)}
            >
              Accept offer
            </button>
          </div>
        ) : null}
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "commerce-decline") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Offer declined</strong>
          <span>{item.intentId}</span>
        </div>
        <p className="shell-comms-coord-meta">
          {item.reasonCode}
          {item.note ? ` — ${item.note}` : ""}
        </p>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "poll-request") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Poll</strong>
          <span>{item.question}</span>
        </div>
        <ul className="shell-comms-coord-slots">
          {item.options.map((option) => (
            <li key={option.id}>
              <span>{option.label}</span>
              {showActions ? (
                <button
                  type="button"
                  className="chrome-approve"
                  disabled={busy}
                  onClick={() => onPollVote?.(item.id, option.id)}
                >
                  Vote
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "split-proposal") {
    const shareAmount: MonetaryAmount = {
      amountMinor: item.shareMinor,
      currency: item.currency,
    };
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Split bill</strong>
          <span>{item.label}</span>
        </div>
        <p className="shell-comms-coord-meta">
          Total {formatMonetaryAmount({ amountMinor: item.totalMinor, currency: item.currency })} ·{" "}
          {item.splitCount} ways · Your share {formatMonetaryAmount(shareAmount)}
        </p>
        {showActions ? (
          <div className="shell-comms-coord-rsvp">
            <button
              type="button"
              className="chrome-approve"
              disabled={busy}
              onClick={() => onPaySplitShare?.(item.splitId, item.label, shareAmount)}
            >
              Pay your share
            </button>
          </div>
        ) : null}
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "poll-vote") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Poll vote</strong>
          <span>{item.optionId}</span>
        </div>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "ttt-move") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Move</strong>
          <span>
            {item.mark} → cell {item.cell + 1}
          </span>
        </div>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "ttt-state") {
    const state = item;
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Tic-tac-toe</strong>
          <span>
            {state.status === "active"
              ? `${state.turn}'s turn`
              : state.status === "won"
                ? `${state.winner} wins`
                : "Draw"}
          </span>
        </div>
        <div className="shell-comms-ttt-board">
          {state.board.map((mark, index) => (
            <button
              key={index}
              type="button"
              className="shell-comms-ttt-cell"
              disabled={!showActions || !!mark || state.status !== "active"}
              onClick={() => onTttCell?.(state.gameId, index, state.turn)}
            >
              {mark ?? ""}
            </button>
          ))}
        </div>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "bs-shot") {
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Shot</strong>
          <span>
            {item.shooter} → cell {item.cell + 1}
          </span>
        </div>
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "bs-state") {
    const state = item;
    const setupLabel =
      state.phase === "setup"
        ? `Setup — A ${state.commitA ? "ready" : "placing"} · B ${state.commitB ? "ready" : "placing"}`
        : state.phase === "won"
          ? `${state.winner} wins`
          : `${state.turn}'s turn`;
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>Battleships</strong>
          <span>{setupLabel}</span>
        </div>
        {state.phase === "battle" && showActions && onBsFire ? (
          <div className="shell-comms-bs-board">
            {Array.from({ length: 36 }, (_, index) => {
              const shot = state.shots.find((entry) => entry.cell === index);
              const fired = state.shots.some((entry) => entry.cell === index);
              return (
                <button
                  key={index}
                  type="button"
                  className={`shell-comms-bs-cell${shot?.hit ? " shell-comms-bs-cell-hit" : shot ? " shell-comms-bs-cell-miss" : ""}`}
                  disabled={busy || fired}
                  onClick={() => onBsFire(state.gameId, index)}
                >
                  {shot ? (shot.hit ? "×" : "·") : ""}
                </button>
              );
            })}
          </div>
        ) : null}
        <time>{new Date(item.at).toLocaleTimeString()}</time>
      </div>
    );
  }

  if (item.kind === "shared-list") {
    const items = sharedListItems ?? item.items;
    return (
      <div className={`shell-comms-coord shell-comms-coord-${directionClass}`}>
        <div className="shell-comms-coord-head">
          <strong>{item.title}</strong>
        </div>
        <ul className="shell-comms-shared-list">
          {items.map((entry) => (
            <li key={entry.id}>
              <label className="atom-field atom-field-checkbox">
                <input
                  type="checkbox"
                  checked={entry.done}
                  disabled={busy || !showActions}
                  onChange={() => {
                    const next = items.map((row) =>
                      row.id === entry.id ? { ...row, done: !row.done } : row,
                    );
                    onSharedListChange?.(item.listId, next);
                  }}
                />
                <span className={entry.done ? "shell-comms-list-done" : undefined}>{entry.text}</span>
              </label>
            </li>
          ))}
        </ul>
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
  onAcceptOffer,
  onPollVote,
  onPaySplitShare,
  onTttCell,
  onBsFire,
  sharedListItems,
  onSharedListChange,
}: {
  item: CommsThreadItem;
  busy: boolean;
  showActions: boolean;
  onAcceptSlot: (proposalId: string, slot: SchedulingSlot) => void;
  onDeclineProposal: (proposalId: string) => void;
  onRsvp: (rsvpId: string, response: RsvpAnswer) => void;
  onConfirmTransaction: (transactionId: string, label?: string) => void;
  onDeclineTransaction: (transactionId: string, label?: string) => void;
  onAcceptOffer: (
    offerId: string,
    intentId: string,
    label: string,
    amount: MonetaryAmount,
  ) => void;
  onPollVote?: (pollId: string, optionId: string) => void;
  onPaySplitShare?: (
    splitId: string,
    label: string,
    amount: MonetaryAmount,
  ) => void;
  onTttCell?: (gameId: string, cell: number, mark: "X" | "O") => void;
  onBsFire?: (gameId: string, cell: number) => void;
  sharedListItems?: SharedListItem[];
  onSharedListChange?: (listId: string, items: SharedListItem[]) => void;
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
      onAcceptOffer={onAcceptOffer}
      onPollVote={onPollVote}
      onPaySplitShare={onPaySplitShare}
      onTttCell={onTttCell}
      onBsFire={onBsFire}
      sharedListItems={sharedListItems}
      onSharedListChange={onSharedListChange}
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
      if (item.kind === "poll-vote" && item.direction === "out") {
        ids.add(item.pollId);
      }
    }
    return ids;
  }, [thread]);
}

export function threadItemNeedsActions(
  item: CommsThreadItem,
  respondedIds: Set<string>,
  respondedTxnIds: Set<string>,
  respondedOfferIds: Set<string>,
): boolean {
  if (item.kind === "ttt-state") {
    if (item.status !== "active") return false;
    return item.direction === "out" ? item.turn === "X" : item.turn === "O";
  }
  if (item.kind === "bs-state") {
    if (item.phase !== "battle") return false;
    return item.direction === "out" ? item.turn === "A" : item.turn === "B";
  }
  if (item.direction !== "in") return false;
  if (item.kind === "scheduling-proposal") return !respondedIds.has(item.id);
  if (item.kind === "rsvp-request") return !respondedIds.has(item.id);
  if (item.kind === "poll-request") return !respondedIds.has(item.id);
  if (item.kind === "shared-list") return true;
  if (item.kind === "split-proposal") return !respondedTxnIds.has(`txn-split-${item.splitId}`);
  if (item.kind === "transaction-hold") return !respondedTxnIds.has(item.transactionId);
  if (item.kind === "commerce-offer") return !respondedOfferIds.has(item.offerId);
  return false;
}
