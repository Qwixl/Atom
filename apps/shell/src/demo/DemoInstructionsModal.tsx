import { forwardRef } from "react";

export const DemoInstructionsModal = forwardRef<HTMLDialogElement>(
  function DemoInstructionsModal(_props, ref) {
    return (
      <dialog ref={ref} className="demo-instructions-dialog" aria-labelledby="demo-instructions-title">
        <div className="demo-instructions-dialog-inner">
          <h2 id="demo-instructions-title">What you’re looking at</h2>
          <ol className="demo-instructions-steps">
            <li>
              <strong>Left — Alice (you):</strong> propose a meeting time. Your personal agent sends it.
            </li>
            <li>
              <strong>Right — Bob (business):</strong> the other agent’s inbox. Watch the request arrive,
              then accept a slot.
            </li>
            <li>
              <strong>Activity / Inbox:</strong> the history of what each agent sent and received — not
              email, agent-to-agent.
            </li>
          </ol>
          <form method="dialog" className="demo-instructions-actions">
            <button type="submit" className="btn btn-primary">
              Got it
            </button>
          </form>
        </div>
      </dialog>
    );
  },
);
