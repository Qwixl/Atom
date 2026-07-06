import { forwardRef, useEffect } from "react";

export const DemoInstructionsModal = forwardRef<HTMLDialogElement>(
  function DemoInstructionsModal(_props, ref) {
    useEffect(() => {
      const timer = window.setTimeout(() => {
        if (ref && typeof ref !== "function") {
          ref.current?.showModal();
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }, [ref]);

    return (
      <dialog ref={ref} className="demo-instructions-dialog" aria-labelledby="demo-instructions-title">
        <div className="demo-instructions-dialog-inner">
          <h2 id="demo-instructions-title">Scheduling demo</h2>
          <ol className="demo-instructions-steps">
            <li>
              <strong>Alice</strong> (left) sends a scheduling proposal to <strong>Bob</strong> (right).
            </li>
            <li>Both columns update live — no tab switching.</li>
            <li>Bob accepts or declines; Alice sees the reply on the left.</li>
          </ol>
          <form method="dialog" className="demo-instructions-actions">
            <button type="submit" className="btn btn-primary">
              Begin
            </button>
          </form>
        </div>
      </dialog>
    );
  },
);
