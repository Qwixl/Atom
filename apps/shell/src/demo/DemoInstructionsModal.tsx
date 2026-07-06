import { useEffect, type RefObject } from "react";

export function DemoInstructionsModal({
  dialogRef,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => dialogRef.current?.showModal(), 0);
    return () => window.clearTimeout(timer);
  }, [dialogRef]);

  return (
    <dialog ref={dialogRef} className="demo-instructions-dialog" aria-labelledby="demo-instructions-title">
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
}
