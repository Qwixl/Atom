import type { AuthStepId } from "./authSteps.js";

type AuthStepperProps = {
  steps: AuthStepId[];
  current: AuthStepId;
  labels: Record<AuthStepId, string>;
};

function stepState(
  index: number,
  currentIndex: number,
): "completed" | "active" | "upcoming" {
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "active";
  return "upcoming";
}

export function AuthStepper({ steps, current, labels }: AuthStepperProps) {
  const currentIndex = steps.indexOf(current);

  return (
    <nav className="auth-stepper" aria-label="Progress">
      <ol className="auth-stepper-list">
        {steps.map((step, index) => {
          const state = stepState(index, currentIndex);
          return (
            <li
              key={step}
              className={`auth-stepper-item auth-stepper-item--${state}`}
              aria-current={state === "active" ? "step" : undefined}
            >
              <span className="auth-stepper-node" aria-hidden="true">
                {state === "completed" ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M2.5 7.2 5.4 10 11.5 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="auth-stepper-label">{labels[step]}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
