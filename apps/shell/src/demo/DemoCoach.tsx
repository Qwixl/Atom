import { useEffect, useLayoutEffect, useState } from "react";

export type DemoCoachStep =
  | "welcome"
  | "ask"
  | "build"
  | "bob"
  | "done";

type Tip = {
  id: DemoCoachStep;
  /** First matching element is the spotlight hole. */
  target: string | null;
  kicker: string;
  title: string;
  body: string;
  actionLabel?: string;
};

const TIPS: Tip[] = [
  {
    id: "welcome",
    target: null,
    kicker: "Agent web demo",
    title: "Ask your agent to set up the meeting",
    body: "For this demo you are Alice talking to her agent. Ask it to set up a meeting with Bob — Bob’s agent will receive the request and build an in-chat component for Bob to quickly accept or decline. It’s a simple look at an agent completing a task and rendering dynamic, in-chat components (Level 1 of an agent's potential in Atom).",
    actionLabel: "Show me",
  },
  {
    id: "ask",
    // Chip only — keep the composer under the scrim.
    target: "[data-demo-target='ask']",
    kicker: "Step 1 of 3",
    title: "Ask Alice to schedule",
    body: "Tap the suggestion chip (or type your own ask). Alice’s agent runs on a real model — if something’s missing (like a day or time), it will ask before building UI.",
  },
  {
    id: "build",
    // Prefer the agent-composed picker; fall back to the chat feed.
    target: "[data-demo-target='picker'], [data-demo-target='alice-feed']",
    kicker: "Step 2 of 3",
    title: "Alice’s agent builds the UI",
    body: "Watch the chat: clarifying questions first if needed, then an interactive meeting picker composed in the conversation. Edit the title/time if you like, then send the proposal.",
  },
  {
    id: "bob",
    // Confirm module in Bob’s chat — not the whole pane / Activity list.
    target: "[data-demo-target='bob-confirm'], [data-demo-target='bob-chat']",
    kicker: "Step 3 of 3",
    title: "Bob’s agent confirms",
    body: "Bob’s agent receives the proposal and builds its own confirmation component. Accept or decline — both Activity feeds update.",
  },
  {
    id: "done",
    target: null,
    kicker: "Done",
    title: "That’s the agent web",
    body: "Natural language → agent-built UI → agent-to-agent delivery → human approval. Reload the page anytime for a clean demo (nothing is kept).",
    actionLabel: "Finish guide",
  },
];

function tipFor(step: DemoCoachStep): Tip {
  return TIPS.find((t) => t.id === step) ?? TIPS[0]!;
}

type Rect = { top: number; left: number; width: number; height: number };

export function DemoCoach({
  step,
  onStepChange,
  onDismiss,
}: {
  step: DemoCoachStep;
  onStepChange: (step: DemoCoachStep) => void;
  onDismiss: () => void;
}) {
  const tip = tipFor(step);
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!tip.target) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(tip.target!) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top,
        left: r.left,
        width: Math.max(r.width, 40),
        height: Math.max(r.height, 40),
      });
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    const timer = window.setInterval(measure, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.clearInterval(timer);
    };
  }, [tip.target, step]);

  useEffect(() => {
    document.documentElement.dataset.demoCoach = step;
    return () => {
      delete document.documentElement.dataset.demoCoach;
    };
  }, [step]);

  const pad = 8;
  const tipW = 340;
  const tipEstimate = 220;
  const tipStyle =
    rect && tip.target
      ? (() => {
          const rightLeft = rect.left + rect.width + pad + 8;
          const placeRight = rightLeft + tipW < window.innerWidth - 12;
          if (placeRight) {
            return {
              top: Math.min(
                window.innerHeight - tipEstimate - 12,
                Math.max(12, rect.top),
              ),
              left: Math.min(window.innerWidth - tipW - 12, rightLeft),
            } as const;
          }
          const aboveTop = rect.top - tipEstimate - pad;
          const placeAbove = aboveTop >= 12;
          return {
            top: placeAbove
              ? Math.max(12, aboveTop)
              : Math.min(
                  window.innerHeight - tipEstimate - 12,
                  Math.max(12, rect.top + rect.height + pad + 4),
                ),
            left: Math.min(window.innerWidth - tipW - 12, Math.max(12, rect.left)),
          } as const;
        })()
      : undefined;

  return (
    <div className="demo-coach" role="dialog" aria-modal="true" aria-labelledby="demo-coach-title">
      <div className="demo-coach-scrim" aria-hidden />
      {rect && tip.target ? (
        <div
          className="demo-coach-hole"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
          aria-hidden
        />
      ) : null}

      <aside
        className={`demo-coach-card${tip.target ? " demo-coach-card--anchored" : " demo-coach-card--center"}`}
        style={tipStyle}
      >
        <p className="demo-coach-kicker">{tip.kicker}</p>
        <h2 id="demo-coach-title">{tip.title}</h2>
        <p className="demo-coach-body">{tip.body}</p>
        <div className="demo-coach-actions">
          {step !== "welcome" && step !== "done" ? (
            <button type="button" className="btn btn-ghost" onClick={() => onDismiss()}>
              Skip guide
            </button>
          ) : (
            <span />
          )}
          {tip.actionLabel ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (step === "welcome") onStepChange("ask");
                else if (step === "done") onDismiss();
              }}
            >
              {tip.actionLabel}
            </button>
          ) : (
            <p className="demo-coach-wait" aria-live="polite">
              Waiting for you…
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

export function nextCoachAfterAsk(step: DemoCoachStep): DemoCoachStep {
  if (step === "ask" || step === "welcome") return "build";
  return step;
}

export function nextCoachAfterPicker(step: DemoCoachStep): DemoCoachStep {
  if (step === "ask" || step === "welcome" || step === "build") return "build";
  return step;
}

export function nextCoachAfterSend(step: DemoCoachStep): DemoCoachStep {
  if (step === "ask" || step === "build" || step === "welcome") return "bob";
  return step;
}

export function nextCoachWhenBobReady(step: DemoCoachStep): DemoCoachStep {
  if (step === "bob") return "bob";
  return step;
}

export function nextCoachAfterAccept(step: DemoCoachStep): DemoCoachStep {
  if (step === "bob" || step === "build") return "done";
  return step;
}
