import type { DemoWalkthroughStep } from "./demoPersonas.js";

const STEPS: { id: DemoWalkthroughStep; label: string }[] = [
  { id: "send", label: "Alice sends" },
  { id: "switch-bob", label: "Switch to Bob" },
  { id: "respond", label: "Bob responds" },
  { id: "switch-alice", label: "Switch to Alice" },
  { id: "done", label: "See reply" },
];

const STEP_ORDER: DemoWalkthroughStep[] = [
  "bootstrap",
  "send",
  "switch-bob",
  "respond",
  "switch-alice",
  "done",
];

function stepIndex(step: DemoWalkthroughStep): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx < 0 ? 0 : idx;
}

export function DemoWalkthrough({ step }: { step: DemoWalkthroughStep }) {
  const current = stepIndex(step);
  const visibleSteps = STEPS.filter((s) => s.id !== "bootstrap");

  return (
    <details className="demo-walkthrough" open>
      <summary className="demo-walkthrough-summary">
        <span>Two-agent scheduling demo</span>
        <span className="demo-walkthrough-summary-hint">What to do next</span>
      </summary>
      <div className="demo-walkthrough-body">
        <p className="demo-walkthrough-intro">
          Alice and Bob each have their own agent backend. Messages travel encrypted (MLS) between
          agents; consequential actions happen in shell confirmation chrome.
        </p>

        <ol className="demo-walkthrough-steps" aria-label="Demo progress">
          {visibleSteps.map((item) => {
            const index = STEP_ORDER.indexOf(item.id);
            const done = index < current;
            const active = index === current;
            return (
              <li
                key={item.id}
                className={`demo-walkthrough-step${done ? " is-done" : ""}${active ? " is-active" : ""}`}
              >
                <span className="demo-walkthrough-step-num">{done ? "✓" : index}</span>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ol>

        {step === "send" ? (
          <p className="demo-walkthrough-action">
            You are <strong>Alice</strong>. Choose a date and time below, then send the proposal to
            Bob&apos;s agent.
          </p>
        ) : null}

        {step === "switch-bob" ? (
          <p className="demo-walkthrough-action">
            Proposal sent. Switch to <strong>Bob</strong> using the header toggle — Bob&apos;s inbox
            will show the incoming proposal.
          </p>
        ) : null}

        {step === "respond" ? (
          <p className="demo-walkthrough-action">
            You are <strong>Bob</strong>. Accept or decline the proposal below. Atom opens
            confirmation chrome before anything is sent back.
          </p>
        ) : null}

        {step === "switch-alice" ? (
          <p className="demo-walkthrough-action">
            {current >= STEP_ORDER.indexOf("respond") ? (
              <>
                Response sent. Switch back to <strong>Alice</strong> to see Bob&apos;s answer in the
                thread.
              </>
            ) : (
              <>Switch to <strong>Alice</strong> first to send a scheduling proposal.</>
            )}
          </p>
        ) : null}

        {step === "done" ? (
          <p className="demo-walkthrough-action demo-walkthrough-action-done">
            Full round trip complete. Alice sees Bob&apos;s response; both agents exchanged data
            over MLS. Check <strong>Attestation log</strong> for the recorded decision.
          </p>
        ) : null}
      </div>
    </details>
  );
}
