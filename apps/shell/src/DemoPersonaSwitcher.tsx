import type { DemoPersonaId, DemoWalkthroughStep } from "./demoPersonas.js";
import { DEMO_PERSONAS } from "./demoPersonas.js";

export function DemoPersonaSwitcher({
  active,
  highlight,
  onSwitch,
}: {
  active: DemoPersonaId;
  highlight?: DemoPersonaId | null;
  onSwitch: (persona: DemoPersonaId) => void;
}) {
  return (
    <div className="demo-persona-switcher" role="group" aria-label="Viewing as">
      <span className="demo-persona-switcher-label">Viewing as</span>
      {(["alice", "bob"] as const).map((id) => {
        const persona = DEMO_PERSONAS[id];
        const isActive = active === id;
        const isHighlighted = highlight === id;
        return (
          <button
            key={id}
            type="button"
            className={`demo-persona-btn${isActive ? " is-active" : ""}${isHighlighted ? " is-highlight" : ""}`}
            aria-pressed={isActive}
            onClick={() => onSwitch(id)}
          >
            {persona.label}
          </button>
        );
      })}
    </div>
  );
}

export function highlightPersonaForStep(step: DemoWalkthroughStep): DemoPersonaId | null {
  if (step === "switch-bob") return "bob";
  if (step === "switch-alice") return "alice";
  if (step === "respond") return "bob";
  if (step === "send") return "alice";
  return null;
}
