import { useEffect, useLayoutEffect, useState } from "react";

export type DemoCoachStep =
  | "welcome"
  | "ask"
  | "pick"
  | "watch"
  | "accept"
  | "done";

type Tip = {
  id: DemoCoachStep;
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
    title: "Ask your agent — don’t fill a form",
    body: "On the left, talk to Alice like you would in Atom. She builds an interactive meeting picker in the chat. When you confirm a time, her agent sends it to Bob on the right — agent to agent.",
    actionLabel: "Show me",
  },
  {
    id: "ask",
    target: "[data-demo-target='ask'], [data-demo-target='ask-compose']",
    kicker: "Step 1 of 3",
    title: "Ask Alice to schedule",
    body: "Tap the suggestion chip (or type your own ask). Alice’s agent will reply with a built-in picker component — not a static webpage form.",
  },
  {
    id: "pick",
    target: "[data-demo-target='picker']",
    kicker: "Step 1 of 3",
    title: "Use the agent-built picker",
    body: "This control was composed by the agent into the chat. Pick a time and propose the meeting — that’s an Atom module, rendered inline.",
  },
  {
    id: "watch",
    target: "[data-demo-target='bob-pane']",
    kicker: "Step 2 of 3",
    title: "Watch Bob’s inbox",
    body: "Alice’s agent delivered the proposal to Bob’s agent. The right column is the other party’s view — live, no email thread.",
  },
  {
    id: "accept",
    target: "[data-demo-target='bob-pane']",
    kicker: "Step 3 of 3",
    title: "Accept as Bob",
    body: "Press Accept on a slot in Bob’s inbox. You’re deciding for the business agent — Alice’s Activity updates with the reply.",
  },
  {
    id: "done",
    target: null,
    kicker: "Done",
    title: "That’s the agent web",
    body: "Natural language → agent-built UI → agent-to-agent delivery → human approval. Exit anytime, or ask Alice to propose another time.",
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
  const tipStyle =
    rect && tip.target
      ? ({
          top: Math.min(window.innerHeight - 200, Math.max(12, rect.top + rect.height + pad + 4)),
          left: Math.min(window.innerWidth - 320, Math.max(12, rect.left)),
        } as const)
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
  if (step === "ask" || step === "welcome") return "pick";
  return step;
}

export function nextCoachAfterPicker(step: DemoCoachStep): DemoCoachStep {
  if (step === "ask" || step === "welcome") return "pick";
  return step;
}

export function nextCoachAfterSend(step: DemoCoachStep): DemoCoachStep {
  if (step === "ask" || step === "pick" || step === "welcome") return "watch";
  return step;
}

export function nextCoachWhenBobReady(step: DemoCoachStep): DemoCoachStep {
  if (step === "watch" || step === "pick" || step === "ask") return "accept";
  return step;
}

export function nextCoachAfterAccept(step: DemoCoachStep): DemoCoachStep {
  if (step === "accept" || step === "watch") return "done";
  return step;
}
