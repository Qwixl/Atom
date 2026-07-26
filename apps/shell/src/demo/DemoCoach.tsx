import { useEffect, useLayoutEffect, useState } from "react";

export type DemoCoachStep =
  | "welcome"
  | "title"
  | "when"
  | "send"
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
    kicker: "2-minute tour",
    title: "Agents booking a meeting — live",
    body: "Left is Alice (you). Right is Bob (a business). You’ll send a meeting request from Alice, watch it land in Bob’s inbox, then accept it as Bob. If Activity already shows a note from Bob, ignore it for now — focus on Send.",
    actionLabel: "Show me what to do",
  },
  {
    id: "title",
    target: "[data-demo-target='title']",
    kicker: "Step 1 of 3",
    title: "Type a meeting title",
    body: "Edit the title, or leave it as-is. This is what Bob’s agent will show when the request arrives.",
    actionLabel: "Next — pick a time",
  },
  {
    id: "when",
    target: "[data-demo-target='when']",
    kicker: "Step 1 of 3",
    title: "Select date and time",
    body: "Choose when you want to meet. You’re telling Alice’s agent what to propose.",
    actionLabel: "Next — send",
  },
  {
    id: "send",
    target: "[data-demo-target='send']",
    kicker: "Step 1 of 3",
    title: "Now send",
    body: "Press Send to Bob. Alice’s agent delivers the proposal directly to Bob’s agent — not by email.",
  },
  {
    id: "watch",
    target: "[data-demo-target='bob-pane']",
    kicker: "Step 2 of 3",
    title: "Look at Bob’s inbox",
    body: "Your proposal appears on the right. That’s Bob’s agent receiving Alice’s message live.",
  },
  {
    id: "accept",
    target: "[data-demo-target='bob-pane']",
    kicker: "Step 3 of 3",
    title: "Accept a time as Bob",
    body: "On the right, press Accept on a slot. You’re deciding as Bob — the reply shows up in Alice’s Activity.",
  },
  {
    id: "done",
    target: null,
    kicker: "Done",
    title: "That’s agent-to-agent scheduling",
    body: "Two agents coordinated a meeting while you stayed in control. Exit anytime, or send another proposal to try again.",
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

  if (step === "done" && !tip.actionLabel) return null;

  const pad = 8;
  const tipStyle =
    rect && tip.target
      ? ({
          top: Math.min(
            window.innerHeight - 200,
            Math.max(12, rect.top + rect.height + pad + 4),
          ),
          left: Math.min(
            window.innerWidth - 320,
            Math.max(12, rect.left),
          ),
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
                if (step === "welcome") onStepChange("title");
                else if (step === "title") onStepChange("when");
                else if (step === "when") onStepChange("send");
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

export function nextCoachAfterSend(step: DemoCoachStep): DemoCoachStep {
  if (step === "send" || step === "title" || step === "when" || step === "welcome") return "watch";
  return step;
}

export function nextCoachWhenBobReady(step: DemoCoachStep): DemoCoachStep {
  if (step === "watch" || step === "send") return "accept";
  return step;
}

export function nextCoachAfterAccept(step: DemoCoachStep): DemoCoachStep {
  if (step === "accept" || step === "watch") return "done";
  return step;
}
