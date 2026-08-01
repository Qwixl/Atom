import type { RoomVerificationReport } from "./comms/client.js";

/** Picks the wording for a count, so a single finding does not read as "1 message were". */
function count(n: number, one: string, many: string): string {
  return n === 1 ? `1 message ${one}` : `${n} messages ${many}`;
}

/** True when a member report has any integrity finding worth surfacing. Legacy alone does not qualify. */
export function shouldShowRoomVerificationBanner(
  verification: RoomVerificationReport | null,
): boolean {
  if (!verification || verification.role !== "member") return false;
  const { summary, forks } = verification;
  return (
    summary.unsigned > 0 ||
    summary.invalid > 0 ||
    summary.substituted > 0 ||
    summary.omitted > 0 ||
    forks.length > 0
  );
}

export interface RoomVerificationBannerProps {
  verification: RoomVerificationReport | null;
  canLeave: boolean;
  onReport: () => void;
  onLeave: () => void;
}

export function RoomVerificationBanner({
  verification,
  canLeave,
  onReport,
  onLeave,
}: RoomVerificationBannerProps) {
  if (!shouldShowRoomVerificationBanner(verification)) return null;
  if (!verification || verification.role !== "member") return null;

  const { summary, forks } = verification;
  const forkCount = forks.length;

  return (
    <div className="rooms-verification-banner" role="status">
      <strong className="rooms-verification-banner-heading">
        This room's history doesn't fully check out
      </strong>
      <ul className="rooms-verification-banner-lines">
        {summary.substituted > 0 ? (
          <li>
            {`${count(summary.substituted, "was", "were")} shown with different text than what was signed. Atom is displaying the signed original.`}
          </li>
        ) : null}
        {summary.invalid > 0 ? (
          <li>
            {`${count(summary.invalid, "failed its", "failed their")} signature check.`}
          </li>
        ) : null}
        {summary.unsigned > 0 ? (
          <li>
            {`${count(summary.unsigned, "arrived", "arrived")} without a signature after this room started signing.`}
          </li>
        ) : null}
        {summary.omitted > 0 ? (
          <li>
            {`${count(summary.omitted, "you received directly is", "you received directly are")} missing from the history the host serves. This could be a delivery fault or the host withholding them — Atom can't tell which.`}
          </li>
        ) : null}
        {forkCount > 0 ? (
          <li>
            {`${count(forkCount, "has", "have")} two different signed versions from the same sender at the same position. That's attributable to the sender, not the host.`}
          </li>
        ) : null}
        {summary.legacy > 0 ? (
          <li className="rooms-verification-banner-legacy">
            {`${count(summary.legacy, "predates", "predate")} signing in this room and can't be checked.`}
          </li>
        ) : null}
      </ul>
      <p className="rooms-verification-banner-footnote">
        {
          "Message contents are still encrypted end to end. This is about who wrote what, not who can read it."
        }
      </p>
      <div className="rooms-verification-banner-actions">
        <button type="button" className="panel-btn panel-btn-sm" onClick={onReport}>
          Report room
        </button>
        {canLeave ? (
          <button type="button" className="panel-btn panel-btn-sm panel-btn-danger" onClick={onLeave}>
            Leave room
          </button>
        ) : null}
      </div>
    </div>
  );
}
