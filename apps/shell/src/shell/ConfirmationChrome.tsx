import type { ConsequentialAction } from "@qwixl/shell-core";
import { IconClose } from "./ShellIcons.js";

type ConfirmationChromeProps = {
  action: ConsequentialAction;
  banner: string;
  footnote: string;
  error: string | null;
  isDemoMode: boolean;
  onDecline: () => void;
  onApprove: () => void;
};

export function ConfirmationChrome({
  action,
  banner,
  footnote,
  error,
  onDecline,
  onApprove,
}: ConfirmationChromeProps) {
  return (
    <div className="chrome-overlay" role="dialog" aria-modal="true" aria-labelledby="chrome-dialog-title">
      <div className="chrome-dialog">
        <header className="chrome-dialog-header">
          <div>
            <p className="chrome-dialog-eyebrow">{banner}</p>
            <h2 id="chrome-dialog-title">{action.title}</h2>
          </div>
          <button type="button" className="chrome-dialog-close" aria-label="Close dialog" onClick={onDecline}>
            <IconClose />
          </button>
        </header>

        <div className="chrome-dialog-body">
          <dl className="chrome-terms">
            {Object.entries(action.terms).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <footer className="chrome-dialog-footer">
          <button type="button" className="shell-btn shell-btn-secondary" onClick={onDecline}>
            {action.declineLabel ?? "Decline"}
          </button>
          <button type="button" className="shell-btn shell-btn-primary" onClick={onApprove}>
            {action.confirmLabel ?? "Approve"}
          </button>
        </footer>

        <p className="chrome-footnote">{footnote}</p>
        {error ? <p className="chrome-footnote chrome-footnote-error">{error}</p> : null}
      </div>
    </div>
  );
}
