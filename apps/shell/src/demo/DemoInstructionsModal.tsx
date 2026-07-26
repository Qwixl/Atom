import { forwardRef } from "react";

export const DemoInstructionsModal = forwardRef<HTMLDialogElement>(
  function DemoInstructionsModal(_props, ref) {
    return (
      <dialog ref={ref} className="demo-instructions-dialog" aria-labelledby="demo-instructions-title">
        <div className="demo-instructions-dialog-inner">
          <h2 id="demo-instructions-title">What you’re looking at</h2>
          <ol className="demo-instructions-steps">
            <li>
              <strong>Left — chat with Alice:</strong> ask her to schedule a meeting. She replies with
              an agent-built picker in the conversation — not a website form.
            </li>
            <li>
              <strong>Activity:</strong> the agent-to-agent history once a proposal is sent.
            </li>
            <li>
              <strong>Right — Bob’s inbox:</strong> the other party’s agent receives the proposal.
              Accept a time there.
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
